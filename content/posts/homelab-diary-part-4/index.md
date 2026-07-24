---
title: "Homelab Diary Part 4: Talos, Minus the Manual Work"
date: 2026-07-01
description: "Bootstrapping and upgrading a Talos Kubernetes cluster without ever running talosctl by hand."
tags: ["homelab", "opentofu", "proxmox", "talos"]
series: ["Homelab Diary"]
---

In the previous part of this series, I finally put the homelab together and installed Proxmox on each machine. In the meantime, I've also done some basic setup, such as updating all package repositories on each host, joining all three machines into a Proxmox cluster, and installing a Prometheus exporter to track resource usage and temperatures of each machine.

Now it's time to finally start running things on the homelab, but to do that, I will need a good foundation. I like to do things in an organized way and make as few manual changes as possible. The reason behind it is that I want to continuously build a library of resources that I can share with other people, or just use in the future, when I need it. If I were to set up everything manually, or with scripts, it would be kind of hard to understand for anyone who is not familiar with my setup. I am also sure I would forget how everything works if I came back to it a year later. To tackle this challenge, I decided to use Infrastructure as Code with tools like OpenTofu and Ansible, and GitOps with ArgoCD, and GitHub Actions. This will allow me to build everything in a way I would do it at a real company, and it will force me to keep the whole setup clean.

Let's start with OpenTofu. To keep the whole setup modular and reusable, I will create a monorepository, which will hold all of my OpenTofu modules. I will keep this repository public forever, and I will also handle the versioning, so existing setups relying on these modules won't break anytime I make some changes. Anyone interested in replicating my setup, or a part of it, will then be able to reference the individual modules using the repository URL and a version tag. I will be using this repository in my homelab, which will force me to keep it up-to-date.

My first goal is to be able to create and maintain Kubernetes clusters. I am a big fan of Talos Linux, so that's what my Kubernetes clusters will run on. Lucky for me, there is [siderolabs/talos OpenTofu provider](https://search.opentofu.org/provider/siderolabs/talos/v0.11.0), which, from my experience, is really good. Before I can do anything, I first need to spin up the infrastructure for the clusters, which I will do on Proxmox. There are multiple Proxmox OpenTofu providers, but the best one from my experience is the [bpg/proxmox](https://search.opentofu.org/provider/bpg/proxmox/v0.111.0), so that's what I will be using. I will first go over all the modules, and in the end, I will show an example of how to wire them all together in a nice, scalable way.

## Images

The very first module I need is the one to download Talos images onto the Proxmox nodes. The module is very simple - I just retrieve the image URL by specifying a Talos version and the extensions I need to include in the image, and then use the URL to download the image to the Proxmox nodes.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/images/talos/main.tf" commit="blog/homelab-diary-part4" >}}


## Virtual Machines

The next module I need is the one to create the VMs on Proxmox. I've built this module over the last 2 years, and I think it's pretty flexible, and sufficient for all the standard use cases. The module looks like this:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/main.tf" commit="blog/homelab-diary-part4" >}}

And here are the variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/variables.tf" commit="blog/homelab-diary-part4" >}}

There isn't anything particularly exotic in this module, most of the things are just standard Proxmox VM attributes but there are a few things I want to point out. First is the `virtual_machines` variable, which, as you might see, is the only variable in this module, and it has a lot of different fields nested in it. This approach allows me to only initiate the module once, no matter if I want to create 1 VM or 100 VMs. This is especially useful for K8s clusters, where all VMs have very similar attributes that would otherwise have to be redefined for every single one.

The second thing worth pointing out is the `recreation_hash` field. It feeds into a small `terraform_data` resource that the VM is tied to through `replace_triggered_by` in its `lifecycle` block, so changing that one value is enough to force the VM to be destroyed and recreated, without needing any of its actual settings to change. In the previous iteration of this setup, I used it to hash the Talos image the VM was cloned from, so pointing it at a newly built image would force the VM to be recreated with it - that's basically how I used to do Talos upgrades, by replacing the image and letting the VM get rebuilt. I've since moved on from that twice: first to running `talosctl upgrade` through a `local-exec` provisioner, then off Terraform entirely to a standalone script (more on why further down), so I don't actually use `recreation_hash` on this module anymore. I'm keeping the field around anyway, since it's still a useful way to force a recreation without having to change some unrelated argument just to trigger it.

Third is the `cdrom` block, which defaults to interface `ide3` instead of the more obvious `ide2`. Reasoning behind this one is simple: Proxmox always reserves `ide2` for the cloud-init drive whenever cloud-init is enabled, so if the cdrom also defaulted to `ide2`, it would just collide with it. `ide3` is simply the next slot that's actually free.

## Talos

This is the last module I need for this part, and there is a lot to unpack here. If you are familiar with the Talos cluster creation process, this is basically it, just transformed from individual talosctl commands to OpenTofu code. The module opens with the `talos_machine_secrets` resource, which generates the secrets shared by the whole cluster. Then there is `talos_client_configuration`, which generates a talosconfig for the whole cluster, and `talos_machine_configuration`, which generates a machine config for each node. `talos_machine_configuration_apply` applies that config - to every node, control planes included, and unsequenced.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/main.tf" commit="blog/homelab-diary-part4" lines="1-35" >}}

That unsequenced part is a deliberate choice, not an oversight. A config change on a control plane can restart kube-apiserver, controller-manager, and scheduler on that node - not always, depending on which part of the config actually changed, but the module has no way to know that in advance. Applying to every control plane at once therefore isn't strictly risk-free. I went back and forth on this: an earlier version of this module sequenced control plane config application one node at a time, gated on etcd staying healthy between each, the same way `scripts/upgrade-talos.sh` still does further down. In practice that turned out to be a lot of extra script for a risk that mostly shows up during an actual OS upgrade, or when I'm specifically touching control plane components like the API server config - both already get careful, deliberate treatment - rather than during day-to-day config changes, where I generally know what I'm about to change. So I simplified it back down: only upgrades get the sequencing and health gate now: for everything else, I'm expected to know what I'm doing before I hit apply.

Once every node has its config applied, there's one more small piece of plumbing before the actual bootstrap: `bootstrap_trigger`. Its only job is forcing `talos_machine_bootstrap` to run again if the first control plane node (whichever one happens to come first in the `nodes` map) ever gets rebuilt from scratch, tied to that node's own `recreation_hash` and ignoring every other node - bootstrapping is a one-time, whole-cluster action, so it should only redo itself if that exact node's disk gets wiped, not whenever some unrelated worker changes. Then `talos_machine_bootstrap` itself finally runs the cluster bootstrap.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/main.tf" commit="blog/homelab-diary-part4" lines="37-54" >}}

Once the cluster is bootstrapped, I confirm that it becomes healthy using the `talos_cluster_health` data source, and retrieve the kubeconfig using the `talos_cluster_kubeconfig` resource. That's it for `main.tf` - Talos OS upgrades used to be the last thing in this file too, as a `terraform_data` resource shelling out to `talosctl upgrade` via a `local-exec` provisioner. They aren't anymore.

I pulled that out after actually sitting down and comparing notes with a friend who runs Talos at a much bigger scale, and looking at his own upgrade tooling next to mine. The short version: an upgrade is a multi-minute, multi-node procedure - one node at a time, health-gated between each - and `local-exec` inside a Terraform resource is a bad place to run something like that. Terraform's whole model is converging to a declared state; an upgrade is an imperative procedure wearing a resource's clothes because `triggers_replace` needed something to hang it on. It also means the only way to abort cleanly is to just not interrupt a `tofu apply` for several minutes, which is exactly as fragile as it sounds - I'd already run into that risk elsewhere in this same setup, from an entirely unrelated `tofu destroy` I interrupted mid-flight.

So the OS upgrade now lives outside Terraform entirely, as `scripts/upgrade-talos.sh`. Terraform still owns declaring each node's target `installer_image_url` and exposes it (along with each node's reachable IP and role) through a new `nodes` output; the script reads that declared state via `tofu output` and reconciles the real cluster to match it, one node at a time. It picked up a few things the old in-Terraform version didn't have room for: an etcd snapshot before touching anything, full pre-flight health checks (Talos *and* Kubernetes level, not just Talos), and after each node comes back it waits for that node to report `Ready` in Kubernetes and uncordons it before moving on, not just that Talos itself is happy. It also deliberately avoids the cluster's VIP for every check along the way - the VIP is etcd-election based and can drop out from under you while a control plane is mid-reboot, so every call is pinned to a specific node instead, and never to the one currently being upgraded.

None of that Kubernetes-level checking was possible in the old version, and that's not an oversight either - the old script also had to work at cold bootstrap time, before any CNI exists, where `talosctl upgrade --wait` and Kubernetes readiness checks just hang forever. This script only ever runs against an already-running cluster, so that constraint is gone, and it can afford to be more thorough about it.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/scripts/upgrade-talos.sh" commit="blog/homelab-diary-part4" >}}

Just like the VM module, everything here is driven by two variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/variables.tf" commit="blog/homelab-diary-part4" >}}

The `cluster` variable holds the settings shared by every node in the cluster - things like the cluster name, the pod and service subnets, or whether kube-proxy should be disabled because Cilium is handling that instead. The `nodes` variable is a map, same idea as `virtual_machines` in the previous module: the key becomes the node's identity, and the value holds everything specific to that one node, like its IP, MAC address, and whether it's a controlplane or a worker.

One thing worth pointing out is the `name` and `region` fields under the `cluster` variable. The `name` field is the actual Talos cluster name, used for cluster registration, while the `region` field only ends up in a `topology.kubernetes.io/region` node label. The `region` field is important because the Proxmox CSI plugin uses it for volume topology matching, and it has to match the Proxmox cluster the VM is on - when I originally had it coupled to the Talos cluster's own name, the CSI plugin just didn't work. The `name` field is still useful on its own too: if I ever run two Talos clusters on the same physical Proxmox cluster, each can get its own name, while both still report the same region, since Proxmox CSI only cares about the physical cluster a node lives on.

With the variables out of the way, most of the actual logic lives in `locals.tf`, which does all the prep work before `main.tf` ever touches a resource. `talos_api_ips` is a small one, but sets up a pattern I reuse a few times: it defaults to each node's own IP, but can be overridden per node via `talos_api_ip`. I added this so the module also works on other cloud providers later, where a node's private cluster IP and the address you'd actually reach its Talos API on can be different (tested on Hetzner).

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="1-13" >}}

Right after that comes `control_plane_ips` and `worker_ips`, both filtered and pulled out of `talos_api_ips` above. Both also get exposed as part of the `nodes` output, and that's what `upgrade-talos.sh` uses to build its own control-planes-first, sorted-for-stability upgrade order - the same ordering used to live here as a dedicated `upgrade_order` local, back when the upgrade logic itself lived in this file too.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="15-16" >}}

`cluster_endpoint` is the more interesting one. Every machine config needs a `cluster_endpoint` to be considered valid, but before the cluster exists there's no external load balancer or DNS record pointing at it yet. So it falls back through three options: an explicit `cluster.endpoint` override first, then `cluster.vip`, and only then the first control plane node's own IP if neither is set. A brand new single-node cluster works with nothing configured, and a proper HA setup is just a matter of setting one variable.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="18-24" >}}

`kubelet_extra_args` merges two unrelated things into the same map. `node_taints` exists because of a NodeRestriction quirk: my first instinct was to taint nodes through a `machine.nodeTaints` patch, but Kubernetes blocks a kubelet from changing its own node's taints once it has registered, so that patch just gets rejected. The only thing that reliably works is passing the taints at kubelet startup, via `--register-with-taints`, so `node_taints` gets turned into a kubelet extraArg instead. `provider_id`, sitting right next to it, is unrelated - it sets kubelet's `--provider-id` flag so a cloud controller manager can match a node back to its cloud instance, e.g. hcloud://<id> for Hetzner, or an equivalent for any other CCM. I don't use it on Proxmox since there's no CCM here, but I want the module to also work elsewhere eventually, so the field stays in and just stays unset in this homelab.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="26-40" >}}

`gateway_api_manifests` is just a couple of Gateway API CRD URLs baked into every cluster's `extraManifests`, so they exist before Kubernetes even comes up.

The reason why I have this here is that I deploy everything with ArgoCD, so that's one of the first things I install onto the Kubernetes cluster. However, my ArgoCD deployment creates an HTTPRoute for itself, and if the Gateway API CRDs are not in the cluster yet, the ArgoCD Helm installation fails. That's why I decided to deploy and maintain the CRDs through OpenTofu instead.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="42-48" >}}

The last one, `node_config_patches`, is where all of that actually turns into a machine config, by combining a few `.tftpl` templates under `templates/machine-config` - one shared by every node, and one each for control planes and workers. I could have built these inline as nested `yamlencode()` blocks, but Talos machine configs get long and deeply nested fast, so having the YAML shape visible in its own file is a lot easier to read and diff.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="blog/homelab-diary-part4" lines="50-116" >}}

Here's the control plane template, which is the more interesting of the two:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/templates/machine-config/control-plane.yaml.tftpl" commit="blog/homelab-diary-part4" >}}

A few fields in there are worth calling out individually. `certSANs` is where `vip` and `api_server_extra_sans` actually land, so the kube-apiserver's TLS cert covers whatever address I end up hitting it through, VIP or otherwise, instead of just the node's own IP. `api_server_config` gets merged in right after, using `indent(4, api_server_config)` so whatever raw YAML I pass in lines up correctly under `apiServer:` - that's the escape hatch for things like OIDC flags I didn't want to build a dedicated variable for.

`allowSchedulingOnControlPlanes` and `externalCloudProvider` are both plain on/off switches, off by default, on when I actually need them - a single control plane node needs scheduling allowed on itself, and any cloud provider with a CCM (Hetzner included) needs `externalCloudProvider` enabled for it to work, which matters most exactly in that single-node case, since it's also the only node a LoadBalancer Service could reach. `cni` and the pod/service subnets aren't here anymore, by the way - they live in the shared template now, since they're genuinely cluster-wide settings, not something specific to control planes; `cni` stays hardcoded to `none` on purpose either way, since Talos would happily install Flannel for me, but I always replace it with Cilium afterward, so there's no point letting Talos install a CNI just to immediately tear it back out.

Turning `allowSchedulingOnControlPlanes` on has a side effect worth knowing about: Talos labels every control plane node to keep it out of external and L2-announcement load balancer backend pools by default, which is the right call for a normal HA cluster where control planes aren't meant to serve regular traffic. But if scheduling is allowed on that node - the whole point of a single-node or all-in-one cluster - that label means nothing can reach it through a LoadBalancer Service. So whenever `allowSchedulingOnControlPlanes` is on, the template also deletes that label via Talos's `$patch: delete` syntax, which is the officially documented way to remove a value Talos's own config generation added rather than something one of my patches set.

The network block is the same three-way fallback in both templates: use DHCP if `use_dhcp` is set, use a named interface if `interface_name` is set, or fall back to matching the interface by MAC address via `deviceSelector`. That last option exists because Proxmox doesn't guarantee predictable interface names across reboots, so pinning to a MAC address is the more reliable choice in a homelab. On a control plane node, the VIP shows up a second time here too, this time assigned directly to the interface through Talos's own keepalived integration, not just referenced in the cert.

The worker template follows the same shape, just without the control plane specific bits like the VIP or the API server config - it's mostly just network setup and a sysctl bump for `vm.max_map_count`, which most memory-mapped-heavy workloads (Elasticsearch, OpenSearch, various vector databases) expect to already be raised, so I just set it cluster-wide on workers instead of chasing it down per app later.

The module finishes off with four outputs: `talosconfig` and `kubeconfig`, so I can talk to the cluster with talosctl and kubectl right away, `machine_configs`, in case I ever need to inspect what actually got sent to a node, and `nodes` - each node's reachable IP, role, and target installer image, which is what `upgrade-talos.sh` reads to know what to do. The first three are marked sensitive, since none of them are things I want showing up in a plan output or CI log; `nodes` isn't - none of it is secret, and the upgrade script needs to be able to read it with a plain `tofu output -json`.

That's three modules covered - images, virtual machines, and now Talos itself. Next up, I'll show how all of them wire together into an actual running cluster.

## Putting It All Together

This lives in the repo as its own example, `terraform/examples/talos-on-proxmox`, and it's deliberately minimal - just the three modules from this post, wired together into a cluster that actually boots. No Cilium, no Proxmox CSI, no GitOps bootstrap yet - those are all separate concerns I'm saving for future parts of this series, so this example stays focused on just standing up the infrastructure and the cluster itself.

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part4" >}}

Three steps, in order: download the Talos image, provision a VM per node from that image, then bootstrap Talos on top of the VMs. The one detail worth pointing out is how `mac_address` gets into the Talos node config - it's not a variable I set anywhere, it's read straight back out of `module.vms.mac_addresses`. Proxmox assigns the MAC when the VM gets created, and the Talos module just needs to be told the same address so its `deviceSelector` can match the right NIC. No manual MAC pinning, no coordinating two separate values by hand.

That same value doubles as `recreation_hash` too:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/locals.tf" commit="blog/homelab-diary-part4" lines="65-89" >}}

`recreation_hash` only actually does something on whichever node happens to come first in the `nodes` map - it's what the Talos module ties its cluster re-bootstrap to, so if that specific node's VM ever gets rebuilt without a pinned MAC, Proxmox hands it a new one, which changes `mac_address`, which changes `recreation_hash`, which redoes the bootstrap to match. It's a no-op on every other node, but setting it everywhere means I don't have to remember which node happens to be first.

The rest is just plumbing: `talos_cluster_name`, `k8s_version`, and `gateway_api_version` are new variables feeding `cluster.name`, `nodes[*].k8s_version`, and `cluster.gateway_api_version`. `region` just reuses the cluster name for now, since nothing in this example actually reads it yet - that only starts to matter once Proxmox CSI gets wired in.

Running `tofu apply` against this gets me a Talos cluster with a working control plane and a `kubeconfig`/`talosconfig` I can pull straight out of the outputs. What it doesn't get me yet is a cluster that can actually run anything, since there's still no CNI installed - we will look into setting up Cilium CNI with OpenTofu for this setup in the next episode. This was a pretty extensive post, but there was a lot to cover, and I prepared a base for all the upcoming blog posts. See you at the next one!