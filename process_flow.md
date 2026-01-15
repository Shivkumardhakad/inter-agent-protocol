# The Nexus Execution Lifecycle

## Process Flow Diagram

```mermaid
graph TD
    User([User Input]) -->|Natural Language Request| Frontend[Frontend UI]
    Frontend -->|POST /proxy/execute| Orch[Orchestrator Node.js]
    
    subgraph "Phase 1: Planning"
        Orch -->|Decompose Request| Gemini1[Gemini 1.5 Flash]
        Gemini1 -->|Actionable Tasks| Registry[(MongoDB Agent Registry)]
        Registry -->|Matched Agents| Discovery[Agent Discovery]
    end
    
    subgraph "Phase 2: Preparation"
        Discovery --> CheckCache{Check Semantic Cache}
        CheckCache -->|Hit| Payload[Retrieve Payload]
        CheckCache -->|Miss| Docs{Fetch Docs?}
        Docs -->|Static Docs| Static[Use StaticDocs]
        Docs -->|Dynamic Docs| Fetch[Fetch /docs endpoint]
        Static --> Gemini2[Gemini Payload Gen]
        Fetch --> Gemini2
        Gemini2 -->|Generated JSON| Payload
    end
    
    subgraph "Phase 3: Execution"
        Payload -->|Execute Request| Proxy[Proxy Server]
        Proxy -->|Auth Headers + Payload| AgentAPI[External Agent / API]
        AgentAPI -->|Response| Result{Success?}
        
        Result -->|Yes| Agg[Aggregation]
        Result -->|No / 400 Error| Heal{Self-Healing?}
        Heal -->|Yes| DeleteMap[Delete Mapping]
        DeleteMap -->|Retry| Docs
        Heal -->|No| Error[Return Error]
    end
    
    subgraph "Phase 4: Synthesis"
        Agg -->|Raw JSONs| Gemini3[Gemini Summarization]
        Gemini3 -->|Human-Readable Summary| UserOutput([Final Response])
    end

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Gemini1 fill:#ccc,stroke:#f66,stroke-width:2px,stroke-dasharray: 5 5
    style Gemini2 fill:#ccc,stroke:#f66,stroke-width:2px,stroke-dasharray: 5 5
    style Gemini3 fill:#ccc,stroke:#f66,stroke-width:2px,stroke-dasharray: 5 5
    style AgentAPI fill:#bbf,stroke:#333,stroke-width:2px
```

## UI Component Highlights

### Mission Status
- **Visual Progress**: Real-time progress bars and status badges (IDLE, RUNNING, DONE) for each agent task.
- **Location**: Displayed within the "Mission Log" console.

### Log Console
- **Reasoning Log**: A live stream of the AI's thought process, explaining *why* a specific endpoint or parameter was chosen.
- **Transparency**: Shows the raw "Verification Targets" and execution logic.

### Agent Registry
- **Dashboard View**: A list of active, registered agents (e.g., GitHub, SalonBot).
- **Health Status**: Indicators showing if an agent is online and responsive.
