/**
 * rag.ts — Static resume context for system-prompt grounding.
 *
 * The desktop renderer ran cosine-similarity RAG over an embedded
 * chunks bank (3 chunks, ~10 KB of text). For the mobile build that's
 * overkill — at this size, just inlining the full resume into the
 * system prompt is cheaper, faster, and removes a network round-trip
 * per turn. Every Tier-3 answer gets the full document for context.
 *
 * The chunks were extracted by pdf-parse during desktop setup and
 * carry a known encoding artifact: U+FFFD (the � replacement char)
 * appears wherever the original PDF had an em-dash or section bullet.
 * We clean these once at module load so the prompt ships clean
 * em-dashes without paying the regex cost per call.
 */

// Each chunk pasted verbatim from
//   C:\Users\Administrator\AppData\Roaming\livecallassistant\chunks.json
// and joined with a blank line between, matching the order the
// desktop chunker produced them (0 → 1 → 2).
const RAW_RESUME = [
  `NITHIN KOKKISA
Data Scientist | ML Engineer | AI & Analytics Leader
Lewisville, TX (DFW) | +1-945-985-2300 | nithinkokkisa10@gmail.com
linkedin.com/in/nithinkokkisa | github.com/Kokkisa
EAD Authorization � No Sponsorship Required | Immediately Available
PROFESSIONAL SUMMARY
Data Scientist and AI/ML practitioner with 12 years of applied analytical and digitalization leadership at HPCL � a
Fortune  Global  500  energy  company  ($50B+  revenue).  Built  and  deployed  production  ML  systems,  computer  vision
pipelines,  NLP  platforms,  RAG-based  AI  applications,  and  enterprise  analytics  platforms  across  a 55-plant  national
network processing ~1.5 million cylinders daily. Led the data investigation that saved $7.7M � awarded HPCL Best
of Best (top 0.25% of 4,000+ officers). Designed APES � an AI procurement system reducing evaluation cycles from 2
days to 20 minutes (98.6% reduction). Deployed production RAG chatbot on HPCL enterprise portal serving the full
national  network. IIT  Jodhpur  B.Tech  (Mechanical  Engineering)  +  MBA  Finance.  Local  to DFW. EAD � no sponsorship
required.
TECHNICAL SKILLS
Machine Learning & AI: XGBoost, Gradient Boosting, Random Forest, Logistic Regression, K-Means Clustering, Isolation
Forest, SHAP Explainability, CLTV Modeling (BG-NBD + Gamma-Gamma), Anomaly Detection
Computer  Vision: Python,  OpenCV,  TensorFlow,  CNN-based  Defect  Detection,  OCR  Pipelines,  Real-time  IoT  Sensor
Analytics
NLP  &  Generative  AI: LangChain,  OpenAI  GPT-4,  FAISS  Vector  Database,  RAG  Pipelines,  Sentiment  Analysis  (NLTK,
TextBlob, VADER), Text Classification, NER
Forecasting  &  Statistics: Prophet,  SARIMA,  ARIMA,  ETS,  Hierarchical  Forecasting,  Demand  Pattern  Classification
(ADI/CV�),  Forecast  Accuracy  &  Bias  (MAPE, WMAPE),  A/B Testing,  Hypothesis Testing,  Regression  Analysis,  Statistical
Process Control
Data Engineering: Python  (Pandas, NumPy,  Scikit-learn),  PySpark  ETL,  SQL  (Window Functions,  CTEs, Optimization),
SAP-integrated  ETL  Pipelines,  PostgreSQL,  SQLite,  Git/GitHub,  Flask,  FastAPI,  AWS  (EC2,  S3,  SageMaker),  Kubernetes,
Docker
Visualization & BI: Power BI (DAX, Star Schema, Time Intelligence), Plotly, Matplotlib, Seaborn, Streamlit, Role-based
Dashboards
ERP & Enterprise Systems: SAP S/4HANA (MM/PM) � 2 years, JD Edwards ERP (MM/PM/SD) � 10 years, SCADA/PLC,
Automated Tank Gauging, Master Data Management
PROFESSIONAL EXPERIENCE
Data Scientist & Analytics Lead
Hindustan Petroleum Corporation Limited (HPCL)
India Jul 2013 � May 2025
Built  and  deployed  production  ML  systems,  computer  vision  pipelines,  NLP  platforms,  RAG-based  AI  applications,  and
enterprise analytics across a 55-plant national LPG network. Led the $7.7M data investigation awarded HPCL Best of Best
� top 0.25% of  4,000+ officers. Managed 435+ personnel and $3.9M annual budget. Youngest appointee to
senior plant leadership in HPCL history.

AI & Generative AI:
� Designed and deployed APES (Automated Procurement Evaluation System) using LangChain and GPT-4 �
automating  end-to-end  tender  evaluation  with  three-tier  human-in-the-loop  workflow  and  complete  audit  trail.
Deployed on **AWS (EC2, S3)** and orchestrated with **Kubernetes.** Reduced evaluation cycle from 2 days to
20 minutes � 98.6% reduction.`,

  `� Deployed production  RAG-based  chatbot on  MyHPCL  enterprise  portal � enabling  natural  language  querying
across  Operations,  Maintenance,  Procurement,  and  Safety  manuals  using LangChain,  GPT-4,  FAISS  vector
database. Built conversation caching layer and human feedback loop for continuous model improvement. Deployed
on **AWS (EC2, SageMaker)** with **Kubernetes** orchestration � network-wide across all 55 plants.

Computer Vision & IoT:
� Designed  and  deployed OCR-based  tare  weight  automation  pipeline  (Python,  OpenCV,  TensorFlow)
achieving 99%+  read  accuracy at  3,200  cylinders/hour  across ~1.5  million  daily  cylinder  operations �
eliminating manual encoding errors and systematic overfill/underfill incidents.
� Deployed CNN-based automated cylinder pre-inspection system replacing manual visual inspection at 3,200
cylinders/hour � trained on labeled defect datasets (dents, cuts, corrosion) enforcing consistent standards-compliant
rejection at full industrial throughput across 55 plants.
� Implemented IoT  sensor-based  bottom  corrosion  detection using Isolation  Forest  anomaly  detection
(scikit-learn) � closing critical safety blind spot completely undetectable by human inspection across ~1.5 million
daily operations.

Machine Learning & Predictive Analytics:
� Led $7.7M multi-source data investigation � analyzing 10 years of operational records applying multivariate
correlation analysis to disprove upstream supplier's $7.7M financial claim. Demonstrated terminal gain/loss was a
function of all operational variables combined � not a single source. Saved $7.7M. Awarded Best of Best.
� Deployed network-wide predictive maintenance system across 55 plants � replacing manual gauge monitoring
with continuous IoT sensor data streams processed through Isolation Forest anomaly detection (scikit-
learn) with dual-layer rule-based and ML alerting. Reduced unplanned equipment downtime network-wide.
� Built distributor churn risk prediction model (XGBoost, SHAP) across 6,200+ HP Gas distributors � flagging
at-risk distributors based on digital feedback trend deterioration across 85 million+ customer touchpoints.
� Applied CLTV  modeling  (BG-NBD  +  Gamma-Gamma) and K-Means  segmentation to  stratify  6,200+
distributors by long-term revenue contribution � informing discount tier eligibility and targeted engagement strategy.
� Conducted network-wide purchase price variance analysis across 30-40 spare categories � Python, Pandas,
statistical analysis on multi-year SAP procurement data. Designed and implemented centralized procurement
model delivering ~$2.3M in verified annual network-wide savings � 2.6% cost reduction per plant.

NLP & Sentiment Analytics:
� Built NLP-based  distributor  performance  analytics  platform � applying sentiment  analysis  (NLTK,
TextBlob,  VADER) to  classify  digital  customer  feedback  across  delivery,  staff  behavior,  showroom  service,  and
complaint  resolution  dimensions  across 6,200+  distributors. Integrated  sentiment  scores  into  automated 100-
point performance scoring model replacing manual officer evaluation.
� Conducted safety audit analytics across 13 plants � ingesting 334 unstructured audit observations, performing
feature engineering and feature construction (Pandas, NumPy), pattern analysis via Matplotlib/Seaborn,
delivering prioritized compliance action framework via Power BI dashboards. Achieved 58% improvement in
audit compliance against company benchmark.

Forecasting & Supply Chain Analytics:
� Led  end-to-end  design  of daily  demand  forecasting  and  supply  optimization  pipeline across  55  plants �
building Python-based time-series models (Prophet, SARIMA) with fully automated SAP-integrated ETL
pipeline triggered on plant day-end completion, delivering next-day indent recommendations to plant, regional, zone,
and HQ by 1100 hrs daily. Achieved zero supply disruptions across 55-plant network over 12 years serving
3,300+ distributors.`,

  `� Applied distributor discount optimization using regression modeling, A/B testing, Market Basket Analysis,
and  CLTV  stratification across 6,200+  distributors � replacing  manual  officer-driven  discount  calculations  with
standardized, data-driven pricing engine eliminating inconsistencies across the network.

Data Engineering & Dashboards:
� Designed  and  deployed real-time  web-based  carousel  analytics  platform � Python  (Flask),  PostgreSQL
backend, per-filling-head deviation analysis using Pandas and Plotly with role-based dashboards from plant officer
to HQ replacing end-of-shift manual reports.
� Built network-wide preventive maintenance platform � digitizing ~3,000 equipment tags across 55 plants
with OEM schedules, automated due-date alerting, and role-based Power BI compliance dashboards from plant
to HQ tracking completed vs missed tasks.
� Built network-wide spare parts warehouse management system � managing 1,500+ SKUs with optimum
inventory models, ABC/VED/JIT classification (Python, SQL), cross-plant spare transfer engine, and automated
purchase initiation alerts.
� Led design and deployment of automated logistics optimization system across all plants � replacing manual
truck-to-delivery assignment with rule-based automated allocation eliminating planning bias and improving transporter
management consistency network-wide.
� Conceptualized  and  deployed kiosk-based  digital  training  management  system � automated  platform  with
integrated pre/post assessment analytics, competency tracking, and training need identification. Eliminated
6 employee-hours per plant per month. Delivered compliance dashboards and audit-ready training records to
plant management.
GITHUB PORTFOLIO
github.com/Kokkisa � Applied data science portfolio covering ML, NLP, time-series forecasting, PySpark, generative AI,
computer vision, and analytics engineering � all rooted in Fortune Global 500 operational problem sets.
EDUCATION
B.Tech, Mechanical Engineering  �  Indian Institute of Technology (IIT) Jodhpur   (2009 � 2013)
MBA, Finance  �  Osmania University, Hyderabad
ADDITIONAL INFORMATION
Work Authorization: EAD � authorized to work in the U.S., no sponsorship required. Immediately available.
Location: Lewisville, TX (DFW) � open to relocation across the United States.
Languages: English (Professional), Hindi (Native), Telugu (Native), Kannada (Conversational)
Key Recognition: HPCL Best of Best � Outstanding Achievement Award (2019-20) � Top 10 of 4,000+ officers (top
0.25%)`,
].join('\n\n');

// Cleanup runs once at module-load time, not per call. The regex
// collapses any surrounding horizontal whitespace into a single space
// on either side of the em-dash, and leaves newlines untouched so
// bullet markers stay on their own lines.
const RESUME_TEXT = RAW_RESUME.replace(/[ \t]*�[ \t]*/g, ' — ');

export function getResumeContext(): string {
  return RESUME_TEXT;
}
