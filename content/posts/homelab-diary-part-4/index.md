---
title: "Homelab Diary Part 4: Talos, Minus the Manual Work"
date: 2026-08-19
description: "Bootstrapping and upgrading a Talos Kubernetes cluster without ever running talosctl by hand."
tags: ["homelab", "opentofu", "proxmox", "talos"]
series: ["Homelab Diary"]
---

In the previous part of this series, I finally put the homelab together and installed Proxmox on each machine. In the meantime, I've also done some basic setup, such as updating all package repositories on each host, joining all three machines into a Proxmox cluster, and installing a Prometheus exporter to track resource usage and temperatures of each machine.

Now it's time to finally start running things on the homelab, but to do that, I will need a good foundation. I like to do things in an organized way and make as few manual changes as possible. The reason behind it is that I want to continuously build a library of resources that I can share with other people, or just use in the future, when I need it. If I were to set up everything manually, or with scripts, it would be kind of hard to understand for anyone who is not familiar with my setup. I am also sure I would forget how everything works if I came back to it a year later. To tackle this challenge, I decided to use Infrastructure as Code with tools like OpenTofu and Ansible, and GitOps with ArgoCD, and GitHub Actions. This will allow me to build everything in a way I would do it at a real company, and it will force me to keep the whole setup clean.

Let's start with OpenTofu. To keep the whole setup modular and reusable, I will create a monorepository, which will hold all of my OpenTofu modules. I will keep this repository public forever, and I will also handle the versioning, so existing setups relying on these modules won't break anytime I make some changes. Anyone interested in replicating my setup, or a part of it, will then be able to reference the individual modules using the repository URL and a version tag. I will be using this repository in my homelab, which will force me to keep it up-to-date.

My first goal is to be able to create and maintain Kubernetes clusters. I am a big fan of Talos Linux, so that's what my Kubernetes clusters will run on. Lucky for me, there is [siderolabs/talos OpenTofu provider](https://search.opentofu.org/provider/siderolabs/talos/v0.11.0), which, from my experience, is really good. Before I can do anything, I first need to spin up the infrastructure for the clusters, which I will do on Proxmox. There are multiple Proxmox OpenTofu providers, but the best one from my experience is the [bpg/proxmox](https://search.opentofu.org/provider/bpg/proxmox/v0.111.0), so that's what I will be using. I will first go over all the modules, and in the end, I will show an example of how to wire them all together in a nice, scalable way.

## Images

The very first module I need is the one to look up Talos images. The module is very simple - I just give it a Talos version and the extensions I need, and it asks the Talos Image Factory for the resulting installer image and ISO URLs.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/images/main.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

Now, I know I mentioned that I don't like doing things manually, but there are cases where automating something introduces a rabbit hole of issues that need to be patched, and makes the whole solution complex, and fragile. Originally, I was downloading the Talos images on Proxmox nodes automatically, using this module. And that worked fine for a setup I was mainly using for experimentation, but not for running production workloads. Before diving into why it wasn't good enough for production, I want to lay down some context. 

Talos uses 2 images. The first is the ISO, loaded as a CD-ROM in Proxmox's case, and only read once, on a VM's very first boot, to bring up Talos in maintenance mode. The more common way to run Talos on Proxmox is importing a raw disk image directly, skipping the install step entirely - but Proxmox's OpenTofu provider only supports that by SSHing into the node itself, since disk import isn't something the Proxmox API exposes. I wanted a setup that only ever needed an API token, no SSH access to any host, so I went with the ISO instead.

The second is the installer image, a container image Talos pulls to actually lay itself onto the dedicated disk. That installer-image pull happens both during the first boot and every time talosctl upgrade runs later. An upgrade doesn't re-attach the ISO, it just has the already-running Talos pull a new installer image and reinstall itself in place. So the ISO really is single-use: once that first install completes, nothing in normal operation ever needs it again.

Now to the reason why my original setup wasn't good enough for production environments. I first realized it when my friend, [Martin Hope](https://www.linkedin.com/in/martin-hope), was telling me about issues he encountered when he tried to use similar setup in production. He was trying to use it on OpenStack, and some OpenStack deployments store the VM-to-source-image relationship in metadata, and refuse to delete an image as long as any VM still references it, even long after that VM has been upgraded via the installer image and stopped needing the original at all. Cleanup just fails, and old images pile up in state with no clean way out.

This made me look closer at my own setup to see if something similar could happen to me on Proxmox, and it turned out it could, just not in the same way. An OpenStack instance and a Proxmox VM both stop needing the original image pretty much right after they boot, so deleting it doesn't actually break anything that's already running - the real problem is provisioning from it again later, whether that's a new cluster, rebuilding the current one, or just a new node joining it. My module didn't protect against that at all. Bumping the Talos version would quietly delete the previous version's ISO too, so every version bump wasted bandwidth re-downloading a full ISO nobody needed, and if I ever had to rebuild a node that was still declared on an older version, there was nothing left to boot it from.

I tried a couple of fixes that kept the download as a OpenTofu resource, but none of them held up cleanly, so I pulled it out of the module entirely. It now only handles the lookup, to get the installer_image, iso_url, and iso_file_name. Nothing in the module ever downloads or deletes anything on Proxmox, and it's no longer locked to Proxmox specifically either. The same lookup works unchanged whether the VMs end up on Proxmox, OpenStack, or anywhere else.

When a new node now needs to boot, I just fetch the ISO myself and upload it through Proxmox's own download-url API by hand. The same action can also be done in the Proxmox web UI, using the "Download from URL" button. There's no `pvesm` subcommand for this, so I am using curl:

```bash
curl -k -H "Authorization: PVEAPIToken=$PROXMOX_API_TOKEN" \
  -X POST "https://<proxmox-host>:8006/api2/json/nodes/<node>/storage/<datastore>/download-url" \
  --data-urlencode "content=iso" \
  --data-urlencode "filename=$(tofu output -raw iso_file_name)" \
  --data-urlencode "url=$(tofu output -raw iso_url)"
```

It's a manual step, but it's a relatively rare one, it only comes up when provisioning a new cluster, reprovisioning the current one, or a new node joining it, never on a version bump or an upgrade. Every ordinary Talos or Kubernetes version change flows entirely through the installer image, which Talos pulls over the network on its own, Proxmox is never involved and nothing gets deleted as a side effect.


## Virtual Machines

The next module I need is the one to create the VMs on Proxmox. I've built this module over the last 2 years, and I think it's pretty flexible, and sufficient for all the standard use cases. The module looks like this:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/main.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

And here are the variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/variables.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

There isn't anything particularly exotic in this module, most of the things are just standard Proxmox VM attributes but there are a few things I want to point out. First is the `virtual_machines` variable, which, as you might see, is the only variable in this module, and it has a lot of different fields nested in it. This approach allows me to only initiate the module once, no matter if I want to create 1 VM or 100 VMs. This is especially useful for K8s clusters, where all VMs have very similar attributes that would otherwise have to be redefined for every single one.

Second is the `cdrom` block, which defaults to interface `ide3` instead of the more obvious `ide2`. Reasoning behind this one is simple: Proxmox always reserves `ide2` for the cloud-init drive whenever cloud-init is enabled, so if the cdrom also defaulted to `ide2`, it would just collide with it. `ide3` is simply the next slot that's actually free.

## Talos

This is the last module I need for this part, and there is a lot to unpack here. If you are familiar with the Talos cluster creation process, this is basically it, just transformed from individual talosctl commands to OpenTofu code. The module opens with the `talos_machine_secrets` resource, which generates the secrets shared by the whole cluster. Then there is `talos_client_configuration`, which generates a talosconfig for the whole cluster, and `talos_machine_configuration`, which generates a machine config for each node. `talos_machine_configuration_apply` applies that config - to every node, control planes included.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/main.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="1-27" >}}

Once every node has its config applied, `talos_machine_bootstrap` runs the cluster bootstrap against the first control plane node - specifically, whichever control plane's node name sorts first alphabetically. That's a OpenTofu quirk worth knowing: `keys()` always returns map keys sorted, not in the order you wrote them, so the "first" control plane is picked by name, not by position in the `nodes` map.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/main.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="29-36" >}}

Once the cluster is bootstrapped, I confirm that it becomes healthy using the `talos_cluster_health` data source, and retrieve the kubeconfig using the `talos_cluster_kubeconfig` resource. That's it for `main.tf` - upgrades are handled entirely outside OpenTofu, more on that at the end of this section.

Just like the VM module, everything here is driven by two variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/variables.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

The `cluster` variable holds the settings shared by every node in the cluster - things like the cluster name, the pod and service subnets, or whether kube-proxy should be disabled because Cilium is handling that instead. The `nodes` variable is a map, same idea as `virtual_machines` in the previous module: the key becomes the node's identity, and the value holds everything specific to that one node, like its IP, MAC address, and whether it's a controlplane or a worker.

Quick note on the `name` and `region` fields under the `cluster` variable. The `name` field is the actual Talos cluster name, used for cluster registration, while the `region` field only ends up in a `topology.kubernetes.io/region` node label. The `region` field is important because the Proxmox CSI plugin uses it for volume topology matching, and it has to match the Proxmox cluster the VM is on, not the Talos cluster's own name - two Talos clusters on the same physical Proxmox cluster still need to report the same region for the CSI plugin to work, so coupling it to the Talos cluster name would break that. Keeping `name` and `region` separate also means each of those two clusters can still have its own distinct `name`.

With the variables out of the way, most of the actual logic lives in `locals.tf`, which does all the prep work before `main.tf` ever touches a resource. `talos_api_ips` is a small one, but sets up a pattern I reuse a few times: it defaults to each node's own IP, but can be overridden per node via `talos_api_ip`. I added this so the module also works on other cloud providers later, where a node's private cluster IP and the address you'd actually reach its Talos API on can be different.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="1-15" >}}

Right after that comes `control_plane_ips` and `worker_ips`, both filtered and pulled out of `talos_api_ips` above, and exposed as their own outputs, `controlplane_ips` and `worker_ips`.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="17-18" >}}

`cluster_endpoint` is the more interesting one. Every machine config needs a `cluster_endpoint` to be considered valid, but before the cluster exists there's no external load balancer or DNS record pointing at it yet. So it falls back through three options: an explicit `cluster.endpoint` override first, then `cluster.vip`, and only then the first control plane node's own IP if neither is set. A brand new single-node cluster works with nothing configured, and a proper HA setup is just a matter of setting one variable.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="20-26" >}}

`kubelet_extra_args` is a small one: `provider_id`, when set, becomes kubelet's `--provider-id` flag, so a cloud controller manager can match a node back to its cloud instance, in whatever URI format that CCM expects. I don't use it on Proxmox since there's no CCM here, but I want the module to also work elsewhere eventually, so the field stays in and just stays unset in this homelab.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="28-34" >}}

`gateway_api_manifests` is just a couple of Gateway API CRD URLs baked into every cluster's `extraManifests`, so they exist before Kubernetes even comes up.

The reason why I have this here is that I deploy everything with ArgoCD, so that's one of the first things I install onto the Kubernetes cluster. However, my ArgoCD deployment creates an HTTPRoute for itself, and if the Gateway API CRDs are not in the cluster yet, the ArgoCD Helm installation fails. That's why I decided to deploy and maintain the CRDs through OpenTofu instead.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="36-42" >}}

The last one, `node_config_patches`, is where all of that actually turns into a machine config, by combining a few `.tftpl` templates under `templates/machine-config` - one shared by every node, and one each for control planes and workers - plus a couple of small inline patches for things that don't need their own template, like `node_taints` going straight in as a `machine.nodeTaints` patch when a node has any set. I could have built the templated parts inline as nested `yamlencode()` blocks too, but Talos machine configs get long and deeply nested fast, so having the YAML shape visible in its own file is a lot easier to read and diff.

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="44-101" >}}

Here's the shared template first, since every node gets it:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/templates/machine-config/common.yaml.tftpl" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

`k8s_version` gets baked into every control plane component's image tag individually - apiServer, controllerManager, proxy, scheduler, kubelet - instead of one central version field, since that's just how Talos expects it. `disable_kube_proxy` is a plain conditional right here too, tying back to the `cluster` variable - when it's on, kube-proxy just doesn't get deployed, since Cilium replaces it.

`cni` is hardcoded to `none`, and `podSubnets`/`serviceSubnets` are set here too, both cluster-wide on purpose - Talos actually validates the network config stays identical across every node, not just control planes, so none of this could live in a role-specific template even if I wanted it to.

`machine.install.image` is `installer_image_url` - the installer image from earlier, the same container image Talos pulls to lay itself onto disk. It's also the value I bump to trigger a Talos OS upgrade later, more on that in Upgrades below. `nodeLabels` is where `region` and `zone` end up too, as `topology.kubernetes.io/region` and `topology.kubernetes.io/zone`, plus whatever's in `node_labels` for anything more specific, like a dedicated worker pool.

Next is the control plane template, still the more interesting of the two role-specific ones:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/talos/templates/machine-config/control-plane.yaml.tftpl" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

A few fields deserve a closer look. `certSANs` is where `vip` and `api_server_extra_sans` land, so the kube-apiserver's TLS cert covers whatever address I actually hit it through, VIP or otherwise, not just the node's own IP. `api_server_config` gets merged in right after, using `indent(4, api_server_config)` so whatever raw YAML I pass in lines up correctly under `apiServer:` - that's the escape hatch for things like OIDC flags I didn't want a dedicated variable for.

`allowSchedulingOnControlPlanes` and `externalCloudProvider` are both plain on/off switches, off by default, on when I actually need them. A single control-plane node needs scheduling allowed on itself, and any cloud provider with a CCM needs `externalCloudProvider` on to work - which matters most in that single-node case, since it's also the only node a LoadBalancer Service could ever reach.

Turning `allowSchedulingOnControlPlanes` on has a side effect I had to work around. Talos labels every control plane node to keep it out of external and L2-announcement load balancer backend pools by default, which makes sense for a normal HA cluster where control planes don't serve regular traffic. But if scheduling is allowed on that node - the whole point of a single-node or all-in-one cluster - that label means nothing can reach it through a LoadBalancer Service. So whenever `allowSchedulingOnControlPlanes` is on, the template also deletes that label, via Talos's `$patch: delete` syntax - the officially documented way to remove a value Talos's own config generation added, rather than something one of my patches set.

The network block is the same three-way fallback in both templates: use DHCP if `use_dhcp` is set, use a named interface if `interface_name` is set, or fall back to matching the interface by MAC address via `deviceSelector`. That last option exists because Proxmox doesn't guarantee predictable interface names across reboots, so pinning to a MAC address is the more reliable choice in a homelab. On a control plane node, the VIP shows up a second time here too, this time assigned directly to the interface through Talos's own keepalived integration, not just referenced in the cert.

The worker template follows the same shape, just without the control plane specific bits like the VIP or the API server config - it's mostly just network setup and a sysctl bump for `vm.max_map_count`, which most memory-mapped-heavy workloads (Elasticsearch, OpenSearch, various vector databases) expect to already be raised, so I just set it cluster-wide on workers instead of chasing it down per app later.

The module finishes off with six outputs: `talosconfig` and `kubeconfig`, so I can talk to the cluster with talosctl and kubectl right away, `machine_configs`, in case I ever need to inspect what actually got sent to a node, and `nodes` - each node's reachable IP, role, and target installer image, which is what drives the upgrade tooling covered in Upgrades below. `controlplane_ips` and `worker_ips` are just those same IPs pre-filtered by role, for anything else that wants them without having to filter `nodes` itself. The first three are marked sensitive, since none of them are things I want showing up in a plan output or CI log; the rest aren't - none of it is secret, and the upgrade tooling needs to be able to read `nodes` with a plain `tofu output -json`.

### Upgrades

Both Talos OS and Kubernetes upgrades are handled entirely outside `main.tf`, by `scripts/talos.sh`, which doesn't even live inside this module.

An upgrade takes several minutes and touches every node - snapshot etcd, then go node by node, checking health between each one. That's not something a OpenTofu resource is good at. OpenTofu is built to compare what you declared to what's actually there and fix the difference, not to run a multi-step procedure like this, and doing that through a `local-exec` provisioner means the only way to abort cleanly is to just not interrupt `tofu apply` for several minutes. That's fragile: if the apply gets interrupted, a node can end up in an unknown state with no clean way to recover.

So OpenTofu only owns declaring each node's target `installer_image_url`, exposed through a `nodes` output along with each node's reachable IP and role. Actually rolling that out to the cluster is `scripts/talos.sh`'s job. It lives at the repo root instead of inside this module, since it isn't OpenTofu and doesn't need fetching through a module source. It's also a single self-contained file on purpose, meant to be `curl`'d and run directly, rather than several files that could drift out of sync with each other.

One dispatcher, two subcommands, so there's one thing to remember instead of a script per operation. `talos.sh upgrade-talos <cluster-dir>` reads the declared state via `tofu output` and rolls the real cluster to match it, one node at a time - control planes first, then workers, both sorted for a stable order across runs. `talos.sh upgrade-k8s <cluster-dir> <target-version>` does the same for Kubernetes, driving `talosctl upgrade-k8s`, which already sequences its own rollout across every node, so there's no per-node loop to write for that one.

Both only ever run against a cluster that's already bootstrapped and running, so they can afford to be thorough. They snapshot etcd before touching anything, check both Talos and Kubernetes health before starting, and avoid the cluster's VIP the whole time - VIP reliability during a control-plane reboot depends on the provider and network setup, so instead of assuming either way, every check is pinned to a specific node, never the one currently being upgraded. `upgrade-talos` also waits for each node to report `Ready` in Kubernetes and uncordons it afterward, just as insurance in case a previous failed run left it cordoned - Talos already uncordons automatically after its own reboot, so this is just a safety net.

`upgrade-talos` and `upgrade-k8s` want things done in a different order.

`upgrade-talos` reads its target version straight from OpenTofu's `installer_image_url`, so OpenTofu has to go first: bump `installer_image_url`, `tofu apply`, then run the script to actually roll it out.

`upgrade-k8s` works the other way around. It still pulls kubeconfig, talosconfig, and the node list from OpenTofu to reach the cluster at all, same as `upgrade-talos` - what it doesn't do is read a target version from OpenTofu. You pass that directly on the command line instead, since `talosctl upgrade-k8s` doesn't care what OpenTofu thinks the version is. So the order flips: run the script against the real cluster first, confirm it worked, and only then bump `k8s_version` in OpenTofu and apply, just to keep the declared version in sync with what's actually running.

Because of that, `upgrade-k8s` can't just check whether OpenTofu's side was already updated - `k8s_version` isn't exposed as an output the way `installer_image_url` is, and the variable name isn't even fixed, it depends on whoever's calling the module. So instead it checks the cluster's actual current version against the target I gave it. If they already match, that's suspicious: either this already ran, or `k8s_version` got bumped and applied before the script ran, which is the wrong order. Either way, it stops and asks instead of just proceeding.

```
curl -fsSL https://raw.githubusercontent.com/hovorka-labs/iac-modules/f4f58a1acecfe2c56ddf1e91776c017ec873e3f4/scripts/talos.sh -o talos.sh
chmod +x talos.sh
```

{{< github repo="hovorka-labs/iac-modules" path="scripts/talos.sh" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

That's three modules covered - images, virtual machines, and now Talos itself. Next up, I'll show how all of them wire together into an actual running cluster.

## Putting It All Together

This lives in the repo as its own example, `terraform/examples/talos-on-proxmox`, and it's deliberately minimal - just the three modules from this post, wired together into a cluster that actually boots. No Cilium, no Proxmox CSI, no GitOps bootstrap yet - those are all separate concerns I'm saving for future parts of this series, so this example stays focused on just standing up the infrastructure and the cluster itself.

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" >}}

Three steps, in order: look up the Talos image, provision a VM per node from it, then bootstrap Talos on top of the VMs. One detail: `mac_address` in the Talos node config isn't a variable I set anywhere, it's read straight back out of `module.vms.mac_addresses`. Proxmox assigns the MAC when the VM gets created, and the Talos module just needs to be told the same address so its `deviceSelector` can match the right NIC. No manual MAC pinning, no coordinating two separate values by hand.

Here's how that, and the rest of each node's Talos-facing config, comes together in `locals.tf`:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/locals.tf" commit="f4f58a1acecfe2c56ddf1e91776c017ec873e3f4" lines="64-81" >}}

The rest is just plumbing: `talos_cluster_name`, `k8s_version`, and `gateway_api_version` are new variables feeding `cluster.name`, `nodes[*].k8s_version`, and `cluster.gateway_api_version`. `region` just reuses the cluster name for now, since nothing in this example actually reads it yet - that only starts to matter once Proxmox CSI gets wired in.

Running `tofu apply` against this gets me a Talos cluster with a working control plane and a `kubeconfig`/`talosconfig` I can pull straight out of the outputs. What it doesn't get me yet is a cluster that can actually run anything, since there's still no CNI installed - we will look into setting up Cilium CNI with OpenTofu for this setup in the next episode. This was a pretty extensive post, but there was a lot to cover, and I prepared a base for all the upcoming blog posts. See you at the next one!