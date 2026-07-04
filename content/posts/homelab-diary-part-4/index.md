---
title: "Homelab Diary Part 4: Time to experiment"
date: 2026-07-01
description: "Setting up the foundation for all the experiments."
tags: ["homelab", "hardware", "proxmox", "talos"]
series: ["Homelab Diary"]
---

In the previous part of this series, I finally put the homelab together and installed Proxmox on each machine. In the meantime, I've also done some basic setup, such as updating all package repositories on each host, joining all three machines into a Proxmox cluster, and installing a Prometheus exporter to track resource usage and temperatures.

I was trying to decide how to approach writing these articles from now on, because I want to share something useful and help people, but I don't want to spend a lot of time writing a step-by-step guide that becomes outdated quickly.

The approach I chose is to explain the idea behind what I want to do, then go over the solution, and share my experience with the implementation. I will also always share code on GitHub and create a specific tag that stores the state of the code as I write this blog post, so it's easier to keep the article relevant even after I change the setup. With that out of the way, let's get into the fun stuff. 

My first big goal is to lay down the foundation for everything. Most of the things I want to do will run on a Kubernetes cluster, so I need to deploy one first. To do that, I will need 6 VMs (3 control planes / 3 workers) distributed across all three nodes for High Availability.  I will use OpenTofu to create VMs and other resources because I like to keep everything defined in code. For Proxmox resources, I will use [bpg/proxmox provider](https://search.opentofu.org/provider/bpg/proxmox/v0.111.0), which is actively maintained by a community, and I have had a positive experience with it in the previous iteration of my homelab.

Before preparing the virtual machine module, I first need to handle download of the Talos image to the Proxmox nodes. This can also be done using OpenTofu, so I will prepare a module for it. The full module can be seen [here](https://github.com/hovorka-labs/iac-modules/tree/blog/homelab-part-4/terraform/modules/proxmox/images/talos). It's fairly simple, I use combination of resources from the Talos OpenTofu provider to retrieve an image URL, based on a Talos version, and extensions I need to include in the image, and then use a resource from the Proxmox provider to download the image on the Proxmox nodes. 

{{< github repo="hovorka-labs/iac-modules" path="/terraform/modules/proxmox/images/talos/main.tf" commit="blog/homelab-diary-part4" >}}

Here's an example of how to use the module:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part4" lines="11-26" >}}




WIP