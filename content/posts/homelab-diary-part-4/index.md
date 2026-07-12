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

{{< github repo="hovorka-labs/iac-modules" path="/terraform/modules/proxmox/images/talos/main.tf" commit="blog/homelab-diary-part4" >}}


## Virtual Machines

The next module I need is the one to create the VMs on Proxmox. I've built this module over the last 2 years, and I think it's pretty flexible, and sufficient for all the standard use cases. The module looks like this:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/main.tf" commit="blog/homelab-diary-part4" >}}

And here are the variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/variables.tf" commit="blog/homelab-diary-part4" >}}

There isn't anything particularly exotic in this module, most of the things are just standard Proxmox VM attributes but there are a few things I want to point out. First is the virtual_machines variable, which as you might see, is the only variable in this module, and it has a lot of different fields nested in it. This approach allows us to only initiate the module once, no matter if we want to create 1 VM, or 100 VMs. This is especially useful for K8s clusters, where all VMs have very similar attributes that would otherwise have to be redefined for every single one.

The second thing worth pointing out is the recreation_hash field. It feeds into a small terraform_data resource that the VM is tied to through replace_triggered_by in its lifecycle block, so changing that one value is enough to force the VM to be destroyed and recreated, without needing any of its actual settings to change. In the previous iteration of this setup, I used it to hash the Talos image the VM was cloned from, so pointing it at a newly built image would force the VM to be recreated with it - that's basically how I used to do Talos upgrades, by replacing the image and letting the VM get rebuilt. I've since switched to running talosctl upgrade through a local_exec instead, because it's a lot less hassle, so I don't actually use recreation_hash on this module anymore. I'm keeping the field around anyway, since it's still a useful way to force a recreation without having to change some unrelated argument just to trigger it.

Third is the cdrom block, which defaults to interface ide3 instead of the more obvious ide2. Reasoning behind this one is simple: Proxmox always reserves ide2 for the cloud-init drive whenever cloud-init is enabled, so if the cdrom also defaulted to ide2, it would just collide with it. ide3 is simply the next slot that's actually free.
