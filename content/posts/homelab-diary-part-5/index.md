---
title: "Homelab Diary Part 5: Making the cluster usable"
date: 2026-08-29
description: "Setting up Cilium CNI and Proxmox CSI Plugin"
tags: ["homelab", "opentofu", "proxmox", "talos"]
series: ["Homelab Diary"]
---

In the previous part of this blog, I went over the process of spinning up a Talos cluster on Proxmox. To avoid making an already long and exhaustive post even longer, I left out one important part of that process, which is deploying a CNI and a CSI, so that's what we'll focus on today.

Let's start with the CNI (Container Network Interface), the specification that network plugins implement to provide two key functions in Kubernetes: assigning an IP address to every pod, and handling pod-to-pod communication. Talos ships with Flannel as its default CNI, but I want to use Cilium instead, so I disabled the default. I also disabled kube-proxy, since Cilium can take over its job with its own eBPF-based replacement. Both are one-line changes in the machine config, and Cilium itself gets installed with OpenTofu, just like everything else in my setup. Before we dive into Cilium, I want to show you what happens when you don't have a CNI in the cluster, which is the case if you deployed the cluster using the example from my previous post. If you list all the pods in the cluster, you will see something like this:

```
$ kubectl get pods -A
NAMESPACE     NAME                                 READY   STATUS    RESTARTS      AGE
kube-system   coredns-8455d46969-8psc2             0/1     Pending   0             127m
kube-system   coredns-8455d46969-dbtj4             0/1     Pending   0             127m
kube-system   kube-apiserver-talos-cp-1            1/1     Running   0             130m
kube-system   kube-apiserver-talos-cp-2            1/1     Running   0             130m
kube-system   kube-apiserver-talos-cp-3            1/1     Running   0             130m
kube-system   kube-controller-manager-talos-cp-1   1/1     Running   2 (130m ago)  127m
kube-system   kube-controller-manager-talos-cp-2   1/1     Running   0             127m
kube-system   kube-controller-manager-talos-cp-3   1/1     Running   2 (130m ago)  127m
kube-system   kube-scheduler-talos-cp-1            1/1     Running   2 (130m ago)  127m
kube-system   kube-scheduler-talos-cp-2            1/1     Running   0             127m
kube-system   kube-scheduler-talos-cp-3            1/1     Running   3 (130m ago)  127m
```

You can see that components like the API Server, Scheduler, and Controller Manager pods all have status Running while the CoreDNS pods have status Pending. If we run `kubectl describe` on one of the coredns pods, we see this:

```
$ k describe pod coredns-8455d46969-8psc2
Name:                 coredns-8455d46969-8psc2
Namespace:            kube-system
...
Tolerations:                 node-role.kubernetes.io/control-plane:NoSchedule op=Exists
                             node.cloudprovider.kubernetes.io/uninitialized:NoSchedule op=Exists
                             node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type     Reason            Age                  From               Message
  ----     ------            ----                 ----               -------
  Warning  FailedScheduling  26m (x23 over 136m)  default-scheduler  0/6 nodes are available: 6 node(s) had untolerated taint {node.kubernetes.io/not-ready: }. preemption: 0/6 nodes are available: 6 Preemption is not helpful for scheduling.
```

CoreDNS doesn't have a toleration that would let it be scheduled onto a node that isn't Ready, and without a CNI, none of the nodes in the cluster ever reach that state - Kubernetes doesn't consider a node's networking configured until a CNI is present. That's exactly why the scheduler has nowhere to put it, as the event confirms: `0/6 nodes are available: 6 node(s) had untolerated taint {node.kubernetes.io/not-ready: }`, reported by `default-scheduler` itself. Now, you may be wondering how it's possible that the pods for the Scheduler, API Server and Controller Manager are in a Running state, when CoreDNS is not. If you run `kubectl describe` on one of these pods, you can even see that these pods have the same toleration as CoreDNS:

```
$ k describe pod kube-apiserver-talos-cp-1
Name:                 kube-apiserver-talos-cp-1
Namespace:            kube-system
...
Node-Selectors:    <none>
Tolerations:       node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                   node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:            <none>
```

The reason why these pods can run is that these are static pods, which are special. These pods are completely ignored by the scheduler, and are instead created as containers directly by the Kubelet. They have the same two tolerations as CoreDNS simply because these get added to every pod in the cluster by default, regardless of what kind of pod it is - it's not something specific to static pods, and it's not what lets them run either. What actually matters is that they never go through the scheduler in the first place, so it doesn't matter what taints the node has or what these pods do or don't tolerate. This is also why the 300 second grace period on those tolerations never actually kicks them off: the object the API server shows you for a static pod is just a mirror, and deleting a mirror pod doesn't stop the real container - kubelet keeps it running straight from the manifest on disk and just recreates the mirror right after.

One way to confirm this is to delete one of the pods that shows an old restart timestamp - for example, by running `kubectl delete pod kube-scheduler-talos-cp-3`, and see what happens:

```
$ kubectl get pods
NAME                                 READY   STATUS    RESTARTS        AGE
coredns-8455d46969-8psc2             0/1     Pending   0               3h24m
coredns-8455d46969-dbtj4             0/1     Pending   0               3h24m
kube-apiserver-talos-cp-1            1/1     Running   0               3h27m
kube-apiserver-talos-cp-2            1/1     Running   0               3h28m
kube-apiserver-talos-cp-3            1/1     Running   0               3h27m
kube-controller-manager-talos-cp-1   1/1     Running   2 (3h28m ago)   3h24m
kube-controller-manager-talos-cp-2   1/1     Running   0               3h24m
kube-controller-manager-talos-cp-3   1/1     Running   2 (3h28m ago)   3h24m
kube-scheduler-talos-cp-1            1/1     Running   2 (3h28m ago)   3h24m
kube-scheduler-talos-cp-2            1/1     Running   0               3h24m
kube-scheduler-talos-cp-3            1/1     Running   3 (3h27m ago)   18s
```

As you can see, the pod comes back with its age reset to a few seconds, but it's still marked as restarted 3 and a half hours ago, because that restart history comes from the container itself, which was never actually touched.
