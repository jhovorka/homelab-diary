---
title: "Homelab Diary Part 5: Making the cluster usable"
date: 2026-08-29
description: "Setting up Cilium CNI and Proxmox CSI Plugin"
tags: ["homelab", "opentofu", "proxmox", "talos"]
series: ["Homelab Diary"]
draft: true
---

In the last part, I deployed a fresh Talos cluster. Now it's time to get it into a usable state, starting with persistent storage.

Out of the box, Kubernetes doesn't know how to create or manage storage. When a workload needs persistent data, it requests storage through a PersistentVolumeClaim (PVC), but something has to fulfill that request. This is the job of a CSI (Container Storage Interface) driver. CSI is a standard interface that lets Kubernetes talk to different storage backends, such as a hypervisor, or a cloud provider, without needing to know how it works internally.

When a PVC is created, the CSI driver provisions a volume on the storage backend, creates the matching PersistentVolume (PV) in Kubernetes, and attaches and mounts the volume on the node where the pod is scheduled. If the pod moves to another node, the driver takes care of detaching and reattaching the volume there.

Which CSI driver you need depends on where your storage lives. Since my cluster runs on Proxmox, I'll use the Proxmox CSI plugin, which creates volumes as virtual disks on the Proxmox host and attaches them directly to the Talos VMs. If you're running on a different platform, the concepts are the same, but the driver and its configuration will differ.

## Deploying the CSI driver

Since I am using Proxmox, there is, as far as i know, only one driver I can use, and that is [sergelogvinov/proxmox-csi-plugin](https://github.com/sergelogvinov/proxmox-csi-plugin). Just as I did in the previous part, I will be deploying everything through OpenTofu, and create a module for each component. I usually don't like to use OpenTofu for deploying, and maintaining K8s resources but I make an exception for the CSI, CNI, and Prometheus CRDs, because trying to deploy these with ArgoCD creates a chicken/egg problem. To handle the actual deployment to K8s, I always use Helm. I will use the driver's official Helm chart, in combination with [opentofu/helm](https://search.opentofu.org/provider/opentofu/helm/latest) provider. The driver requires an API token to interact with the Proxmox API, so I will first create a separate user with the right privileges. I won't go through the modules I used for this because they are super basic, feel free to check them out yourself. Here is how I use these modules to generate the credentials:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part5" lines="64-98" >}}

And here is the module for deploying the driver with Helm:

{{< github repo="hovorka-labs/iac-modules" path="terraform/modules/helm/proxmox-csi-plugin/main.tf" commit="blog/homelab-diary-part5" >}}

It's pretty standard stuff, I choose what chart, and which version do I want to use, and also to what namespace do I want deploy it (it defaults to kube-system to make sure the driver is not blocked by Pod Security Policies whenever they are in a stric mode). Then I specify a path to a values file, which holds all the values I want to override, and lastly, I specify the value for the `config.clusters` field. I keep it outside of the values file because the values for this field are dynamic, and I get them from the module outputs, and general variables I reuse across all modules. Here is how I then invoke the module:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/main.tf" commit="blog/homelab-diary-part5" lines="100-115" >}}

And here is the values file with the overrides I supply path to:

{{< github repo="hovorka-labs/iac-modules" path="terraform/examples/talos-on-proxmox/proxmox-csi-values.yaml" commit="blog/homelab-diary-part5" >}}
