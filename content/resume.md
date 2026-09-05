---
title: "Resume"
layout: "resume"
role: "DevOps Engineer · CNCF Golden Kubestronaut"
location: "Gothenburg, Sweden"
pdf: "/files/jakub-hovorka-cv.pdf"
summary: >-
  DevOps Engineer (4+ years) focused on Kubernetes, CI/CD automation, and
  cloud/hybrid infrastructure built with Infrastructure as Code. Former
  software engineer with a strong understanding of developer workflows.
  Holds the CNCF Golden Kubestronaut title, earned by completing 16
  certifications across the CNCF and Linux Foundation ecosystem.
skills:
  - category: "Kubernetes"
    items: ["AKS", "GKE", "K3s", "Talos"]
  - category: "Infrastructure"
    items: ["Azure", "Google Cloud", "Proxmox"]
  - category: "Networking & Security"
    items: ["Cilium", "Kyverno", "Envoy Gateway", "Ingress NGINX"]
  - category: "CI/CD"
    items: ["ArgoCD", "GitLab CI/CD", "Bitbucket Pipelines", "Helm"]
  - category: "Logs & Metrics"
    items: ["Prometheus", "Grafana", "Thanos", "Loki", "Alloy", "Elasticsearch", "Kibana", "Tempo"]
  - category: "Infrastructure as Code"
    items: ["Terraform", "Ansible"]
  - category: "Core Technologies"
    items: ["Linux", "Docker", "Git"]
  - category: "Scripting"
    items: ["Bash", "Go", "Python"]
  - category: "Storage"
    items: ["MinIO", "PostgreSQL"]
  - category: "Data Platform & Orchestration"
    items: ["Spark", "Argo Workflows", "Argo Events"]
  - category: "AI"
    items: ["kagent", "kmcp", "LiteLLM"]
experience:
  - title: "DevOps Engineer"
    company: "LOGEX AB"
    location: "Gothenburg, Sweden"
    dates: "Jun 2023 – Present"
    summary: >-
      Manage and optimize Kubernetes workloads, CI/CD pipelines, and Helm
      charts, working closely with development teams to troubleshoot
      production issues. Maintain Azure infrastructure with Terraform and
      operate the observability and logging stack (Prometheus, Thanos,
      Grafana, ELK, Loki). Onboard and maintain developer and
      data-engineering tooling with SSO integration, scalable deployments,
      and lifecycle management. Also support and extend data-platform
      tooling for Project Nightingale, integrating Argo Workflows, Spark,
      Trino, Nessie, and JupyterHub.
    achievements:
      - "Unified and standardized all deployment Helm charts across the organization, improving maintainability, consistency, and onboarding speed for engineering teams."
      - "Led the org-wide migration from Bitbucket Pipelines to ArgoCD, then stabilized the platform to reliably deploy 140+ applications across 25 clusters — including educating teams on GitOps workflows."
      - "Revitalized the observability stack (Prometheus, Thanos, Grafana) and modernized the logging platform (ELK Stack), including a full migration to a new environment."
      - "Took ownership of the infrastructure/DevOps track for Project Nightingale — integrating Argo Workflows/Events, Spark, Trino, Nessie, RabbitMQ, MinIO, DataHub, and JupyterHub, designing event-driven workflows and custom Python tooling for Spark-on-Kubernetes."
      - "Led the migration from Ingress NGINX to Envoy Gateway as part of an org-wide move to Gateway API, improving reliability, flexibility, and security of traffic management."
  - title: "DevOps Engineer"
    company: "CGI"
    location: "Prague, Czech Republic"
    dates: "Dec 2022 – Jun 2023"
    summary: >-
      Managed and supported deployments of containerized banking and
      finance applications on Kubernetes using GitLab CI/CD, Helm, and
      ArgoCD, working with developers to resolve issues, perform upgrades,
      and improve deployment workflows across Docker, Kubernetes, Git,
      Bash, SQL, Rancher, and Azure.
    achievements:
      - "Streamlined Kubernetes deployment workflows across multiple client projects, improving release consistency and reducing deployment time."
      - "Improved GitLab CI/CD pipeline reliability by troubleshooting build issues and optimizing pipeline stages."
      - "Enhanced developer productivity with clearer deployment documentation and hands-on guidance in Helm, ArgoCD, and Kubernetes fundamentals."
      - "Supported the adoption of ArgoCD for selected projects, contributing to smoother GitOps-driven deployments."
  - title: "Software Engineer"
    company: "Perlogix"
    location: "Virginia, United States (Remote)"
    dates: "Jan 2022 – Dec 2022"
    summary: >-
      Worked as a full-stack developer on Paradrop, a cybersecurity
      asset-management tool — building backend REST APIs and database
      operations in Python Flask, a vanilla JS/Bootstrap frontend, and
      containerized deployments to DigitalOcean via GitHub Actions.
    achievements:
      - "Designed and implemented core backend functionality in Flask, improving data access reliability and API performance."
      - "Built and refined user-facing features in JavaScript/Bootstrap for a cleaner, more intuitive UI."
      - "Introduced Docker containerization and a stable GitHub Actions CI/CD pipeline, reducing deployment overhead."
      - "Played a key role in delivering a fully functional, production-ready cybersecurity tool used by early customers."
projects:
  - title: "Homelab Infrastructure & GitOps Platform"
    link: "/posts/"
    achievements:
      - "Built an enterprise-like Kubernetes homelab on Proxmox to develop and validate DevOps practices in a controlled environment."
      - "Automated infrastructure provisioning with Terraform (VMs, Talos/K3s clusters, applications) and Ansible (K3s setup, HAProxy configuration)."
      - "Implemented a GitOps workflow with GitLab CI/CD and ArgoCD for automated cluster bootstrapping, CRD deployment, and application management."
      - "Deployed and maintained cert-manager, MetalLB, Envoy Gateway, Loki, Prometheus, Harbor, Authentik, and MinIO."
      - "Built custom Docker images through reusable CI pipelines."
      - "Serves as a hands-on environment for testing new technologies — documented in the posts on this blog."
certifications:
  - name: "CNCF Golden Kubestronaut"
    description: >-
      The highest level of recognition awarded by the Cloud Native
      Computing Foundation (CNCF), earned by completing all 16 CNCF and
      Linux Foundation certifications across the Kubernetes and
      cloud-native ecosystem.
education:
  - title: "Information Technology"
    school: "Information Technology High School Kladno"
    dates: "Sep 2014 – Jun 2018"
    description: >-
      Specialized IT curriculum covering computer science theory, network
      protocols and configuration, operating systems, system
      administration, database fundamentals, and practical hardware
      assembly.
languages:
  - name: "English"
    level: "Full Professional Proficiency (C1/C2)"
  - name: "Czech"
    level: "Native"
---
