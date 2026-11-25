---
title: "Resume"
layout: "resume"
role: "DevOps / Platform Engineer · CNCF Golden Kubestronaut"
location: "Gothenburg, Sweden"
pdf: "/files/jakub-hovorka-cv.pdf"
summary: >-
  DevOps Engineer with 4+ years of Kubernetes in production, across Azure
  and GCP, local cloud providers and on-prem, including a locked-down
  client network. Started as a software engineer, so understands what
  developers need from a platform. Learns new tools quickly, takes them
  from proof of concept to production, and prefers fixing problems
  properly over quick fixes. Stays calm when things break and puts a lot
  of weight on explaining things clearly, to both technical and
  non-technical people. Keeps learning outside work: runs a homelab,
  writes a blog about it, and became a CNCF Golden Kubestronaut in 2026.
skills:
  - category: "Kubernetes"
    items: ["AKS", "GKE", "Talos", "K3s", "Helm"]
  - category: "Cloud & Virtualization"
    items: ["Azure", "Google Cloud", "Proxmox", "OpenStack"]
  - category: "Networking & Security"
    items: ["Cilium", "Gateway API", "Envoy Gateway", "Kyverno", "cert-manager", "OpenBao", "External Secrets"]
  - category: "CI/CD & GitOps"
    items: ["ArgoCD", "Kargo", "GitLab CI/CD", "Bitbucket Pipelines", "GitHub Actions"]
  - category: "Observability & Monitoring"
    items: ["Prometheus", "Grafana", "Thanos", "Loki", "Alloy", "Tempo", "Elasticsearch", "Kibana"]
  - category: "Infrastructure as Code"
    items: ["Terraform", "OpenTofu", "Ansible"]
  - category: "Core Technologies"
    items: ["Linux", "Docker", "Git"]
  - category: "Scripting"
    items: ["Bash", "Python", "Go (Golang)"]
  - category: "Storage"
    items: ["MinIO", "PostgreSQL"]
  - category: "Data Platform & Orchestration"
    items: ["Spark", "Argo Workflows", "Argo Events", "Trino", "RabbitMQ"]
  - category: "AI"
    items: ["kagent", "agent-sandbox", "LiteLLM", "AI coding agents"]
experience:
  - title: "Senior DevOps Engineer"
    company: "LOGEX"
    location: "Gothenburg, Sweden"
    dates: "Jun 2023 – Present"
    summary: >-
      Healthcare data-analytics company. Started in Brno, then the
      Netherlands (2024) and Sweden (2026). Responsible for how LOGEX's
      applications are packaged (Helm), deployed (ArgoCD) and run on 30
      Kubernetes clusters in 7 countries: AKS, GKE, clusters at local cloud
      providers, and on-prem Talos on Proxmox and OpenStack. Troubleshoot
      production incidents across the clusters, from failing deployments to
      networking, storage and performance problems, then follow up with
      lasting fixes and better alerting. Maintain the infrastructure code
      (OpenTofu) for the cloud and on-prem environments, and the
      observability stack: Prometheus, Thanos, Grafana, Loki, Alloy and
      Tempo. Take part in architecture decisions and tool choices, support
      development and data teams, and onboard new DevOps and Platform
      engineers.
    achievements:
      - "Standardized 100+ Helm charts on one shared base chart (HULL), so company-wide changes happen in one place instead of in every repository."
      - "Led the company-wide move from Bitbucket Pipelines to ArgoCD, including teams from acquired companies, and helped all teams adopt GitOps. Tuned the setup as it grew: one ArgoCD instance now deploys ~150 applications to 30 clusters (~2,200 deployments in total) on a small footprint. Adding an application to a new environment went from about a day to an hour or two."
      - "Led the move from Ingress NGINX to Gateway API (Envoy Gateway) across all 30 clusters and ~150 applications."
      - "Brought the observability stack back into shape: moved metrics to a new Thanos setup with alerting, consolidated two legacy ELK stacks into one without data loss, cutting storage in half, and later moved logging to Loki and Alloy."
      - "Owned the infrastructure and DevOps side of Project Nightingale, LOGEX's largest project, a data platform for processing customer data. Helped choose the stack (Argo Workflows and Events, Spark, Trino, Nessie, RabbitMQ, MinIO, DataHub, JupyterHub), designed the event-driven workflows, and built a Python package for running Spark jobs on Kubernetes, so each app can use its own Spark version and scale independently."
      - "Built the initial OpenTofu setup for creating Talos Kubernetes clusters on Proxmox, after trying the approach in the homelab. The Platform team adapted it and rolled it out to the on-prem environments. Also helped bring Cilium and Kyverno into these clusters."
      - "Got LOGEX's applications running in a client's locked-down on-prem network with restricted internet access, adapting the deployments and networking to fit."
      - "Built infrastructure and Go tooling for LOGEX's AI initiatives, including AI-assisted Helm chart generation, AI code review and security checks in CI, and isolated sandboxes for AI coding agents."
  - title: "DevOps Engineer"
    company: "CGI"
    location: "Prague, Czech Republic"
    dates: "Dec 2022 – Jun 2023"
    summary: >-
      Deployed and supported containerized banking and finance applications
      on Kubernetes with GitLab CI/CD, Helm and ArgoCD. Worked closely with
      developers on application issues, version upgrades and deployment
      workflows.
    achievements:
      - "Helped move a legacy KYC (know-your-customer) system to ~40 microservices on Kubernetes, and made the whole platform deployable in one step with ArgoCD and Helm."
      - "Helped other project teams containerize Node/Angular applications and ship them to clients."
      - "Taught developers DevOps tooling and helped run the internal DevOps bootcamp."
  - title: "Software Engineer"
    company: "Perlogix"
    location: "Virginia, United States (Remote)"
    dates: "Jan 2022 – Dec 2022"
    summary: >-
      Full-stack developer on Paradrop, a cybersecurity asset management
      tool.
    achievements:
      - "Built the backend in Python Flask (REST API, database layer) and the frontend in vanilla JavaScript with Bootstrap."
      - "Containerized the application with Docker and set up CI/CD with GitHub Actions for deployments to DigitalOcean."
      - "Building without a big framework gave a solid understanding of how web applications work end to end."
projects:
  - title: "Homelab Infrastructure & GitOps Platform"
    link: "/posts/"
    achievements:
      - "A 3-node Proxmox cluster for learning and testing new tools and ways of running infrastructure, documented in the Homelab Diary posts on this blog."
      - "Fully automated with OpenTofu and GitOps: OpenTofu builds Talos Kubernetes clusters with Cilium and secrets management (OpenBao, External Secrets), then hands over to ArgoCD, which deploys everything else."
      - "Reusable OpenTofu modules and upgrade scripts published on GitHub (hovorka-labs/iac-modules)."
      - "Hands-on work with Kyverno, Authentik SSO, observability and AI agent tooling."
      - "Most of the tools on this CV can be shown running here."
certifications:
  - name: "CNCF Golden Kubestronaut (2026)"
    description: >-
      The highest tier of the CNCF Kubestronaut program, all 16 exams
      passed. Professional: Certified Kubernetes Administrator (CKA),
      Certified Kubernetes Application Developer (CKAD), Certified
      Kubernetes Security Specialist (CKS), Linux Foundation Certified
      System Administrator (LFCS), Certified Cloud Native Platform Engineer
      (CNPE). Associate: KCNA, KCSA, Prometheus (PCA), OpenTelemetry (OTCA),
      Cilium (CCA), Kyverno (KCA), Argo (CAPA), GitOps (CGOA), Istio (ICA),
      Backstage (CBA), Platform Engineering (CNPA).
education:
  - title: "Information Technology"
    school: "Information Technology High School Kladno"
    dates: "Sep 2014 – Jun 2018"
    description: >-
      Specialized IT curriculum including computer science theory, network
      protocols and configuration, operating systems, system
      administration, database fundamentals, and practical hardware
      assembly.
languages:
  - name: "English"
    level: "Full Professional Proficiency (C1/C2)"
  - name: "Czech"
    level: "Native"
  - name: "Swedish"
    level: "Beginner, learning"
---
