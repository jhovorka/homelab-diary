---
title: "Homelab Diary Part 5: Giving the cluster a network"
date: 2026-08-29
description: "Deploying Cilium as the CNI on a Talos cluster with OpenTofu, replacing kube-proxy and MetalLB along the way."
tags: ["homelab", "opentofu", "proxmox", "talos", "cilium"]
series: ["Homelab Diary"]
draft: false
---

In the last part, I deployed a fresh Talos cluster. It boots, it has a working control plane, and I can pull a `kubeconfig` out of the outputs. What it can't do yet is run anything, because the nodes stay `NotReady` until a CNI plugin is installed. So that's what this part is about.

The main job of a CNI (Container Network Interface) plugin is to give every pod an IP address and make sure pods can talk to each other, no matter which node they land on. There are many plugins to choose from, but my go-to choice is Cilium. It's kind of a Swiss Army knife, because it offers so much more than the basic CNI functionality: it can replace kube-proxy, announce `LoadBalancer` IPs on the local network, encrypt traffic between nodes, and show you what's going on with all of it through Hubble.

## Why OpenTofu, and not ArgoCD?

Just as in the previous part, I will be deploying everything through OpenTofu, and I create a module for each component. I usually don't like to use OpenTofu for deploying and maintaining Kubernetes resources, but I make an exception for the CNI and the Prometheus CRDs, because trying to deploy these with ArgoCD creates a chicken/egg problem. ArgoCD itself is made of pods, and pods can't start without a network. So the CNI has to be there before anything else, and once it is, ArgoCD can take over.

To handle the actual deployment to Kubernetes, I always use Helm. I use Cilium's official Helm chart, in combination with the [opentofu/helm](https://search.opentofu.org/provider/opentofu/helm/latest) provider.

## Disabling kube-proxy

Normally, kube-proxy takes care of routing traffic sent to a Service to the pods behind it. Cilium can replace it completely and handle this with eBPF directly in the kernel, which is faster and gives me one less component to run. For this to work, kube-proxy has to be disabled in the Talos config, so there is one small change to the cluster from the last part:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part5" lines="51-62" >}}

The only new line is `disable_kube_proxy = true`. It's an optional field of the `cluster` variable and it defaults to `false`, so the module behaves exactly as before for anyone who doesn't set it.

## The Prometheus CRDs

One of my favorite Cilium features is Hubble, which gives you visibility into network traffic between pods. Hubble can also export flow metrics, and Cilium itself exposes its own metrics too. To get these into Prometheus, the Cilium Helm chart can create ServiceMonitor resources, which tell the Prometheus Operator what to scrape.

The catch is that ServiceMonitor isn't a built-in Kubernetes resource. It's a CRD that comes with the Prometheus Operator, which I will deploy later with ArgoCD. If the CRD doesn't exist when Cilium is installed, the Helm release fails, because Kubernetes doesn't recognize the ServiceMonitor kind. That's why I install the Prometheus CRDs separately with OpenTofu, before Cilium. There are no special parameters, it's just a Helm release of the `prometheus-operator-crds` chart:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/helm/prometheus-operator-crds/main.tf" commit="blog/homelab-diary-part5" >}}

And this is how I invoke it. The `depends_on` makes sure it only runs after the cluster exists:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part5" lines="64-72" >}}

## Deploying Cilium

Now the main part. This is the module:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/helm/cilium/main.tf" commit="blog/homelab-diary-part5" >}}

It's pretty standard stuff. I choose the chart version and the namespace, which defaults to `kube-system`. Then I pass in one or more values files, which hold everything I want to override. `atomic` is turned on, so if the release fails, Helm rolls it back instead of leaving a half-installed CNI behind, and the timeout defaults to ten minutes, because on a fresh cluster the image pulls can take a while.

And this is how I invoke it. It waits for the Prometheus CRDs, for the reason above:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part5" lines="74-86" >}}

The module is the easy part. The important part is the values file, so I will go over it in more detail, section by section.

### Pod networking and routing

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="1-14" >}}

First, IPAM, which is how pods get their IP addresses. In `kubernetes` mode, Cilium uses the PodCIDR that Kubernetes assigns to each node, carved out of Talos's default pod subnet - I'm not overriding it, so it stays at `10.244.0.0/16` (see Part 4). The alternative is Cilium's own `cluster-pool` mode, where Cilium manages its own IP pool instead of relying on Kubernetes' allocation. I don't need that, since Talos already hands out PodCIDRs the standard way. Setting `requireIPv4PodCIDR` makes Cilium wait until a node actually has its PodCIDR before it starts handing out addresses.

By default, Cilium uses an overlay network, where traffic between pods on different nodes is wrapped in VXLAN tunnels. The overlay exists so pods can reach each other even when the underlying network has no idea what a pod CIDR is, which matters when nodes are spread across different networks. All of my nodes sit on the same local network though, so I don't need that. I switched to native routing instead, so packets travel between nodes as they are, without the extra encapsulation. With `autoDirectNodeRoutes`, every node gets routes to the pod CIDRs of all the other nodes. The catch is that this only works when all nodes are on the same L2 network, which is the case in my homelab, but might not be in yours.

`ipv4NativeRoutingCIDR` tells Cilium which traffic can be routed directly, and it has to match that same default pod subnet. Anything going outside of that range, like traffic to the internet, gets masqueraded behind the node's IP address.

### Talos-specific settings

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="16-49" >}}

`kubeProxyReplacement` is the other half of the change I made earlier. Kube-proxy is gone, so Cilium takes over its job.

This creates another chicken/egg problem. Cilium needs to talk to the Kubernetes API server, and normally it would do that through the `kubernetes` Service IP. But without kube-proxy, Service IPs only work once Cilium is running. Talos solves this with KubePrism, a small proxy to the API server that runs on every node at `localhost:7445`. Pointing Cilium at it means it can reach the API server without depending on itself.

The security context and cgroup settings come straight from the [Talos documentation](https://docs.siderolabs.com/kubernetes-guides/cni/deploying-cilium#without-kube-proxy-6). Talos doesn't allow loading kernel modules, so the `SYS_MODULE` capability is left out of the list. Talos also mounts cgroups itself, so Cilium is told to use the existing mount instead of creating its own.

### Getting traffic into the cluster

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="51-55" >}}

L2 announcements make `LoadBalancer` services reachable from my home network. Cilium answers ARP requests for the service IPs, so other devices on the network know where to send the traffic. This replaces MetalLB, which I would otherwise need for the same job. Enabling it here doesn't do anything on its own, though. Cilium also needs a pool of IPs to hand out and a policy that says which services to announce, and I will create those in a later part.

### Security

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="57-63" >}}

With WireGuard encryption enabled, all traffic between pods on different nodes is encrypted. `nodeEncryption` extends that to traffic between the nodes themselves. The nice part is that it's completely transparent, so workloads don't need any changes.

Cilium also offers mutual authentication via SPIRE, which issues an identity to every workload so Cilium can check who's on both ends of a connection. I decided to skip it. It's still in beta, and support for it is already being deprecated in favor of a different feature (Ztunnel Transparent Encryption), so I didn't see the point of taking on a SPIRE server just to use something on its way out.

### Observability

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="65-97" >}}

This is where the Prometheus CRDs from earlier come in. The Cilium agent, the operator, and Envoy each get their own ServiceMonitor. All of them have the `release: kube-prometheus-stack` label, because by default, kube-prometheus-stack only picks up ServiceMonitors with that label. Without it, the monitors would exist, but nothing would scrape them.

I also enabled the Grafana dashboards. Cilium creates them as ConfigMaps, and Grafana loads them automatically once it's deployed.

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/cilium-values.yaml" commit="blog/homelab-diary-part5" lines="99-125" >}}

Finally, Hubble. Hubble Relay collects network flows from all nodes, and the Hubble UI shows them as a map of which services talk to each other. On top of that, I enabled a set of metrics: DNS queries (ignoring AAAA records to reduce noise), dropped packets, TCP, flows, ICMP, and HTTP. The `drop` metric is the one I find most useful, because it shows right away when a network policy blocks something it shouldn't.

## Wrapping Up

With the CRDs and Cilium applied, the nodes can finally go `Ready`, and the cluster can do the first thing it couldn't do on its own: get pods talking to each other and to the network, with no kube-proxy and no MetalLB needed. That's the whole scope I set out for this part. There's still nothing in the cluster to manage what actually runs on top of this network, so that's what I'm heading to next.
