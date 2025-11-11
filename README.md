# Custom UI for Drools 10 - WCO Data Set 4.2.0

## 📖 Introduction

**Custom UI for Drools 10** is a custom user interface developed for the Drools 10 engine, specifically designed to support **WCO Goods Declaration and Cargo Report v4.2.0**.

## 🔥 Introducing Drools 10

**Drools 10** is the latest version of Red Hat Decision Manager, one of the most powerful and popular business rules management systems (BRMS) available today. Drools 10 brings significant improvements:

### ⚡ Key Features of Drools 10

- **🚀 Enhanced Performance**: Optimized engine with 30% faster execution speed compared to previous versions
- **☁️ Cloud Native**: Full support for cloud environments and containerization (Docker, Kubernetes)
- **🔧 Executable Model**: Better compile-time validation and runtime performance
- **📝 Enhanced DRL Syntax**: Improved Drools Rule Language (DRL) syntax that's easier to read and maintain
- **🔗 Spring Boot Integration**: Seamless integration with Spring Boot ecosystem
- **📊 Improved Debugging**: More powerful debugging and monitoring tools

### 🎯 Why Choose Drools 10?

1. **Declarative Programming**: Write business logic as easy-to-understand rules without hard-coding
2. **Separation of Concerns**: Separate business logic from application code
3. **Dynamic Rules**: Change rules without redeploying the application
4. **Complex Event Processing**: Handle complex events and real-time decision making
5. **Scalability**: Efficiently process millions of facts and rules

### 🏢 Use Cases for Customs/WCO Systems

Drools 10 is particularly suitable for Customs systems because:

- **Risk Assessment**: Evaluate cargo risk based on multiple criteria
- **Tariff Classification**: Classify goods by HS Code and automatically apply duties
- **Compliance Checking**: Verify compliance with international trade regulations
- **Document Validation**: Validate the authenticity of various document types
- **Duty Calculation**: Calculate duties and fees accurately and flexibly

### 🎯 Objectives

This project provides an intuitive and user-friendly interface to:
- Manage and edit business rules in Drools
- Track version history of rules
- Support change request approval workflows
- Integrate with WCO Goods Declaration and Cargo Report standards

### 🏗️ Architecture

```
├── Backend (Spring Boot + Drools 10)
│   ├── Business Rules Engine
│   ├── WCO Data Processing
│   └── PostgreSQL Database
├── Frontend (Next.js + TypeScript)
│   ├── Rules Management UI
│   ├── Version Control
│   └── Change Request System
└── Sample Data (WCO 4.2.0 JSON)
    ├── Goods Declaration
    └── Cargo Report
```

### 📋 Key Features

- ✅ Business rules management with version control
- ✅ Intuitive rules editing interface
- ✅ Change history tracking
- ✅ Change request approval system
- ✅ Compatible with WCO standards v4.2.0

## 📁 Sample Data

WCO Data Set 4.2.0 compatible JSON samples are stored in the `json/` directory:

- `goods-declaration-sample.json`: Import goods declaration (IM)
  - Declaration information and related parties
  - Goods details, duties, and fees
  - Supporting documents
  
- `cargo-report-sample.json`: Cargo report and manifest (CRI)
  - Vessel and container information
  - Consignment list
  - Goods details in each shipment

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Start the complete application stack
./docker.sh start

# Or start only database for development
./docker.sh dev
```

**Access URLs:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Database: localhost:5432
- pgAdmin (dev only): http://localhost:5050

---

## 🐳 Docker Commands

The project includes a convenient Docker management script:

```bash
# Start full production stack
./docker.sh start

# Start development environment (DB + pgAdmin only)
./docker.sh dev

# Stop all services
./docker.sh stop

# View logs
./docker.sh logs

# Build images
./docker.sh build

# Clean up everything
./docker.sh clean

# Show service status
./docker.sh status
```

## Prerequisites

### For Docker Setup:
- Docker & Docker Compose

### For Manual Setup:
- Java 17+
- Node.js 18+
- PostgreSQL