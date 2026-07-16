---
title: "Homelab Diary Part 4: Time to lay down the foundation"
date: 2026-07-01
description: "Setting up the foundation for all the experiments."
tags: ["homelab", "opentofu", "proxmox", "talos"]
series: ["Homelab Diary"]
---

In the previous part of this series, I finally put the homelab together and installed Proxmox on each machine. In the meantime, I've also done some basic setup, such as updating all package repositories on each host, joining all three machines into a Proxmox cluster, and installing a Prometheus exporter to track resource usage and temperatures of each machine.

Now it's time to finally start running things on the homelab, but to do that, I will need a good foundation. I like to do things in an organized way, and make as few manual changes as possible. The reason behind it is that I want to continuously build a library of resources, that I can share with other people, or just use in the future, when I need it. If I would set up everything manually, or with scripts, it would be kind of hard to understand for anyone who is not familiar with my setup. I am also sure I would forget how everything works if I would come back to it a year later. To tackle this challenge, I decided to use Infrastructure as Code with tools like OpenTofu and Ansible, and Gitops with tools like ArgoCD / Flux, and Github Actions. This will allow me to build everything in a way I would do it at a real company, and it will force me to keep the whole setup clean.

Let's start with OpenTofu. To keep the whole setup modular and reusable, I will create a monorepository, which will hold all of my OpenTofu modules. I will keep this repository public forever, and I will also handle the versioning, so it does not break anytime I make some changes. Anyone interested in replicating my setup, or a part of it, will then be able to reference the individual modules using the repository URL, and a version tag. I will be using this repository in my homelab, which will force me to keep it up-to-date.

My first goal is to be able to create, and maintain Kubernetes clusters. I am a big fan of Talos Linux, so that's what my Kubernetes clusters will run on. Lucky for me, there is [siderolabs/talos OpenTofu provider](https://search.opentofu.org/provider/siderolabs/talos/v0.11.0), which from my experience is really good. Before I can do anything, I first need to spin up the infrastructure for the clusters, which I will do on Proxmox. There are multiple Proxmox OpenTofu providers, but the best one from my experience is the [bpg/proxmox](https://search.opentofu.org/provider/bpg/proxmox/v0.111.0), so that's what I will be using. I will first go over all the modules, and in the end, I will show an example of how to wire them all together in a nice, scalable way.

## Images

The very first module I need is the one to download Talos images on to the Proxmox nodes. The module is very simple, I just retrieve the image URL, by specifying a Talos version, and the extensions I need to include in the image, and then use the URL to download the image to the Proxmox nodes.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/images/talos/main.tf" commit="blog/homelab-diary-part4" >}}


## Virtual Machines

The next module I need is the one to create the VMs on Proxmox. I've built this module over the last 2 years, and I think it's pretty flexible, and sufficient for all the standard use cases. The module looks like this:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/main.tf" commit="blog/homelab-diary-part4" >}}

And here are the variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/variables.tf" commit="blog/homelab-diary-part4" >}}

There isn't anything particularly exotic in this module, most of the things are just standard Proxmox VM attributes but there are a few things I want to point out. First is the virtual_machines variable, which as you might see, is the only variable in this module, and it has a lot of different fields nested in it. This approach allows us to only initiate the module once, no matter if we want to create 1 VM, or 100 VMs. This is especially useful for K8s clusters, where all VMs have very similar attributes that would otherwise have to be redefined for every single one.

The second thing worth pointing out is the recreation_hash field. It feeds into a small terraform_data resource that the VM is tied to through replace_triggered_by in its lifecycle block, so changing that one value is enough to force the VM to be destroyed and recreated, without needing any of its actual settings to change. In the previous iteration of this setup, I used it to hash the Talos image the VM was cloned from, so pointing it at a newly built image would force the VM to be recreated with it - that's basically how I used to do Talos upgrades, by replacing the image and letting the VM get rebuilt. I've since switched to running talosctl upgrade through a local_exec instead, because it's a lot less hassle, so I don't actually use recreation_hash on this module anymore. I'm keeping the field around anyway, since it's still a useful way to force a recreation without having to change some unrelated argument just to trigger it.

Third is the cdrom block, which defaults to interface ide3 instead of the more obvious ide2. Reasoning behind this one is simple: Proxmox always reserves ide2 for the cloud-init drive whenever cloud-init is enabled, so if the cdrom also defaulted to ide2, it would just collide with it. ide3 is simply the next slot that's actually free.

## Talos

This is the last module I need for this part, and there is a lot to unpack here. If you are familiar with the Talos cluster creation process, this is basically it, just transformed from individual talosctl commands to OpenTofu code. Before that though, the module opens with a bit of Terraform-only plumbing that has no talosctl equivalent: config_trigger, which is similar to the recreation_hash field in the previous module. Its purpose is to force a node's machine config to be reapplied on demand, without needing some unrelated setting to change first, e.g. when the node's underlying VM gets rebuilt but nothing about its Talos config actually changed.

Later in the module, there is a similar thing called bootstrap_trigger, which does the same trick but for the talos_machine_bootstrap resource instead of the config apply. The difference is that it only cares about the first control plane node's own config_trigger, and ignores every other node. That's on purpose: bootstrapping is a one-time, whole-cluster action tied specifically to that first control plane node, so it should only ever fire again if that exact node gets rebuilt, not whenever any random worker in the cluster does.

After the config_trigger, we have the talos_machine_secrets resource, which generates the secrets shared by the whole cluster. Then we have talos_client_configuration, which generates a talosconfig for the whole cluster, talos_machine_configuration, which generates a machine config for each node, and talos_machine_configuration_apply, which applies the machine config to each node. Once all that is sorted, there is the bootstrap_trigger I mentioned earlier, and then talos_machine_bootstrap which finally runs the cluster bootstrap. Once the cluster is bootstrapped, we confirm that it becomes healthy using the talos_cluster_health data source, and we retrieve the kubeconfig using the talos_cluster_kubeconfig resource. The very last thing is the terraform_data resource called upgrade. On the Terraform side, it's triggered whenever installer_image_url changes for a node, but the provisioner itself does a second check before actually running anything: it queries the node's current running version, and only calls talosctl upgrade if that version doesn't already match the target.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/main.tf" commit="blog/homelab-diary-part4" >}}

Just like the VM module, everything here is driven by two variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/variables.tf" commit="blog/homelab-diary-part4" >}}

cluster holds the settings that are the same for every node in the cluster, like the cluster name, the pod and service subnets, or whether kube-proxy should be disabled because I'm going to run Cilium instead. nodes is a map, same idea as virtual_machines in the previous module, where the key becomes the node's identity and the value holds everything specific to that one node, like its IP, MAC address, and whether it's a controlplane or a worker.

One thing I want to point out is that cluster has both a name and a region field, which might look redundant at first. name is the actual Talos cluster name used for cluster registration, while region only ends up in a topology.kubernetes.io/region node label. I split them because I don't necessarily want my Talos cluster name and my topology region to be coupled together, especially since I plan on running more than one cluster later on, possibly spread across more than one physical location.

The actual machine config isn't written directly in main.tf, it's assembled from a handful of .tftpl templates under templates/machine-config, one shared by every node, and one each for control planes and workers, all combined into config_patches. Here is the control plane template, which is the more interesting one of the two:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/templates/machine-config/control-plane.yaml.tftpl" commit="blog/homelab-diary-part4" >}}

Splitting the config into templates like this, instead of building it inline as a big yamlencode() block in main.tf, is mostly for my own sanity. Talos machine configs get long and deeply nested fast, and having the actual YAML shape visible in its own file is a lot easier to read and diff than the equivalent nested Terraform maps would be.

The vip field is worth a closer look too, since it's used in two different ways. It shows up in the machine config as an actual keepalived VIP assigned to the control plane's network interface, but it's also used as a fallback for the cluster's own API endpoint. Every machine config needs to know a cluster_endpoint to be considered valid, and before the cluster exists, there is no external load balancer or DNS entry yet, so the module falls back through cluster.endpoint, then cluster.vip, and only then the first control plane node's own IP if neither is set. That means a brand new single-node cluster works out of the box with nothing configured, and a proper HA setup with a VIP or an external endpoint is just a matter of setting one variable.

There's also a small quirk with node_taints that took me a while to figure out. My first instinct was to just add taints through a machine.nodeTaints patch like everything else, but Kubernetes' NodeRestriction admission plugin blocks a kubelet from modifying its own node's taints after it has already registered, and machine.nodeTaints patches run into exactly that. The only mechanism that reliably works is passing the taints at kubelet startup itself, via --register-with-taints, so node_taints gets turned into kubelet extraArgs instead of a config patch. It's a good example of something that looks like it should be trivial to configure, but ends up requiring you to understand a Kubernetes admission controller to actually get right.

You'll also notice provider_id sitting right next to node_taints in that same extraArgs map, which sets kubelet's --provider-id flag. That one isn't for Proxmox at all, it's there so a cloud controller manager can match a Kubernetes Node back to its cloud instance, e.g. hcloud://<id> for Hetzner's CCM. I don't use it in this homelab since Proxmox has no CCM in the picture, but I wanted this module to also work if I ever spin up nodes on Hetzner, so I left the field in and it just stays unset here.

The last interesting piece is how upgrades work. As I mentioned in the previous section, I used to force a VM rebuild by pointing recreation_hash at a freshly built Talos image, and let the reinstall handle the upgrade. That worked, but it meant every upgrade also meant reprovisioning the whole VM, which is a lot of unnecessary churn for something that should just be a version bump. The Talos OpenTofu provider doesn't have a native upgrade resource, so instead I shell out to talosctl directly through a local-exec provisioner, keyed off each node's installer_image_url. The script first checks what version the node is already running, and skips the upgrade entirely if it already matches, which matters because otherwise a brand new node would try to "upgrade" itself to the exact version it was just bootstrapped with.

The module finishes off with three outputs: talosconfig and kubeconfig, so I can talk to the cluster with talosctl and kubectl right after apply, and machine_configs, which exposes the rendered config for every node in case I ever need to inspect or debug what actually got sent to a machine. All three are marked sensitive, since none of them are things I want showing up in a plan output or CI log.

That's all three modules covered, images, virtual machines, and now Talos itself. In the next section, I'll finally show how all of them wire together into an actual running cluster.
