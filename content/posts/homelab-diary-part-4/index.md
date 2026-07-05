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

My first goal is to be able to create, and maintain Kubernetes clusters. I am a big fan of Talos Linux, so that's what my Kubernetes clusters will run on. Lucky for me, there is [siderolabs/talos OpenTofu provider](https://search.opentofu.org/provider/siderolabs/talos/v0.11.0), which from my experience is really good. Before I can do anything, I first need to spin up the infrastructure for the clusters, which I will do on Proxmox. There are multiple Proxmox OpenTofu providers, but the best one from my experience is the [bpg/proxmox](https://search.opentofu.org/provider/bpg/proxmox/v0.111.0), so that's what I will be using.

The very first module I need is the one to download Talos images on to the Proxmox nodes. The module is fairly simple, I retrieve the image URL, by specifying a Talos version, and extensions I need to include in the image, and then use the URL to download the image to the Proxmox nodes. This is the module:

{{< github repo="hovorka-labs/iac-modules" path="/terraform/modules/proxmox/images/talos/main.tf" commit="blog/homelab-diary-part4" >}}

And here's an example of how to use the module:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part4" lines="12-27" >}}

The next module I need is the one to create the VMs on Proxmox. I've built this module over the last 2 years, and I think it's fairly flexible, and sufficient for all the standard use cases. The module looks like this:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/main.tf" commit="blog/homelab-diary-part4" >}}

And here are the variables:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/proxmox/virtual-machines/variables.tf" commit="blog/homelab-diary-part4" >}}

There isn't anything particularly exotic in this module, most of the things are just standard Proxmox VM attributes but there are a few things I want to point out. First is the virtual_machines variable, which as you might see, is the only variable in this module, and it has a ton of different fields nested in it. The reason why I decided to nest everything into one variable is that it allows us to 
