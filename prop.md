# CUET-QA: Retrieval-Strategy Ablation and Hallucination-Audited Evaluation for a Full-Coverage University RAG Assistant

**A Research Proposal**

**Team:** Team Dropout Squad — [Your Name], Sakib, Ayan
**Department:** Computer Science and Engineering, Chittagong University of Engineering & Technology (CUET)
**Target duration:** 20–25 days
**Target venues:** ICCIT (Bangladesh, IEEE co-sponsored), arXiv preprint
**Scope:** English language, retrieval-augmented generation only — no fine-tuning

---

## 1. Abstract

Retrieval-augmented generation (RAG) has become the default approach for institutional chatbots, including two recent efforts at Khulna University of Engineering & Technology (KUET) and one at BRAC University in Bangladesh. However, each of these systems picks a single retrieval method and a narrow knowledge scope: BRAC University's assistant is restricted to CSE-department resources, and KUET's multimodal assistant is grounded on a single document (the university handbook) with hallucination handled only through refusal-on-empty-retrieval. Neither work isolates retrieval strategy as an experimental variable, and neither scores answer reliability directly. This proposal presents **CUET-QA**, a full-coverage English-language RAG assistant for Chittagong University of Engineering & Technology (CUET) that makes three contributions: (1) a controlled ablation across three retrieval strategies — sparse (BM25), dense (BGE-M3), and hybrid (BM25 + BGE-M3 + Reciprocal Rank Fusion + cross-encoder reranking) — with the generation model held fixed, isolating retrieval as the sole variable; (2) a hallucination-audit layer, built on a self-consistency, NLI-entailment, and perplexity-stacking pipeline the team previously validated in the অলীকবচন Bengali hallucination-detection competition, applied uniformly across all three retrieval conditions to produce a continuous reliability score per answer rather than a binary refuse/answer decision; and (3) full institutional coverage — departments, faculty, admission, facilities, achievements, and career information — broader than either prior Bangladeshi system. The project is scoped for completion within 20–25 days, with no fine-tuning stage, reducing compute risk relative to earlier plans.

---

## 2. Motivation and Problem Statement

Prospective and current students at CUET need fast, reliable answers to institutional questions spread across the university website, notices, department pages, and informal channels. RAG is the pragmatic choice for a 20–25 day timeline — it avoids the compute and data risk of fine-tuning while still producing a usable, evaluable system. The open question this proposal targets is not "can RAG answer university questions" (already shown, repeatedly) but **which retrieval strategy is actually more reliable for this domain, and how do we score that reliability directly rather than just refusing when retrieval fails.**

---

## 3. Related Work

| Work | Institution/Scope | Retrieval method | Knowledge scope | Hallucination handling |
|---|---|---|---|---|
| Transforming Mentorship: An AI Powered Chatbot Approach to University Guidance (arXiv:2511.04172, 2025) | BRAC University | BM25 + ChromaDB (single fixed combo) | CSE department only | Not addressed |
| Towards Developing a Multimodal Chat Assistant for University Stakeholders (arXiv:2607.01115, 2026) | KUET, live at chat.kuet.ac.bd | Semantic only (all-MiniLM-L6-v2 + ChromaDB) | University handbook only | Refusal-on-empty-retrieval; hallucination reduced 31.7% → 6.6% |
| BARKPLUG v.2 (arXiv:2405.08120, 2024) | Mississippi State University | RAG (method not ablated) | University resources | Not addressed as distinct axis |
| KatzBot / KatzGPT (arXiv:2410.16385, 2024–25) | International university | RAG + fine-tuning hybrid | University-specific dataset | Not addressed as distinct axis |
| Systematic review, *Computers & Education* (2025) | 71 papers surveyed | — | — | Names hallucination control as a recurring, unresolved gap |

**Gap:** No existing Bangladeshi work isolates retrieval strategy as a controlled variable, scores hallucination continuously rather than refusing, or covers a full institution rather than one department or one document.

---

## 4. Research Objectives

1. Construct a full-coverage English-language institutional knowledge base and QA evaluation set for CUET, spanning departments, faculty, admission, facilities, achievements, and career information.
2. Run a controlled ablation across three retrieval strategies with the generation model fixed, isolating retrieval as the sole variable.
3. Design and integrate a hallucination-audit layer producing a continuous per-answer reliability score, applied identically across all three retrieval conditions.
4. Produce a paper draft targeting ICCIT and an arXiv preprint, with the knowledge base, eval set, and code released publicly.

---

## 5. Proposed Methodology

### 5.1 Knowledge Base Construction

- **Sources:** CUET official website, department pages, official notices/circulars, admission office materials, and cross-checked entries from active CUET student Facebook groups.
- **Coverage:** all departments and programs, faculty listings, admission procedure (engineering cluster), campus facilities, student and institutional achievements, career/placement information — broader than BRACU's CSE-only or KUET's handbook-only scope.
- **Eval set scale:** target 1,800–2,200 English QA pairs, categorized *static* (rarely changes) vs. *dynamic* (changes yearly), held out consistently across all three retrieval conditions.

### 5.2 Retrieval-Strategy Ablation

Generation model held **fixed** across all three conditions to isolate retrieval as the only variable:

| Condition | Retrieval method |
|---|---|
| R1 — Sparse | BM25 only |
| R2 — Dense | BGE-M3 dense embeddings only |
| R3 — Hybrid | BM25 + BGE-M3 + Reciprocal Rank Fusion + cross-encoder reranking (team's existing contest stack) |

Generation: a fixed open-weight instruction model (e.g., Llama-3.1-8B-Instruct run locally, or Llama-3.3-70B via free API access if local compute is tight, matching BRACU's approach) — no fine-tuning at any stage. Reusing the team's IEEE CS CUET ML Contest 2.0 retrieval pipeline directly for R3 keeps the highest-effort component low-risk.

### 5.3 Hallucination-Audit Layer

Applied identically across R1, R2, and R3, reusing the team's অলীকবচন pipeline:

- **Self-consistency sampling:** k=5 generations per question, agreement scored across samples.
- **NLI entailment:** generated answer checked for entailment against retrieved context.
- **Perplexity / log-likelihood scoring:** flags low-confidence generations.
- **Combination:** signals stacked via logistic regression or gradient boosting into a single per-answer reliability score.

This is the concrete point of difference from KUET's July-2026 system, which only suppresses an answer when retrieval returns nothing — it does not score answers that *do* have retrieved context but may still be wrong.

---

## 6. Evaluation Plan

- **Retrieval accuracy:** top-1 and top-3 accuracy per condition (R1/R2/R3), comparable to KUET's reported 78.3%/92.1%.
- **Generation quality:** BLEU, ROUGE, BERTScore, METEOR, held constant in measurement across all three retrieval conditions — isolates whether retrieval quality, not generation quality, drives differences.
- **Hallucination rate per condition:** via the audit layer.
- **Small-scale human evaluation:** ~50–100 sampled answers per condition, two-annotator verification, Cohen's kappa reported.
- **Latency:** per-condition response time, relevant for real-world deployment comparison.

---

## 7. Timeline (20–25 Days)

| Phase | Days | Activities | Deliverable |
|---|---|---|---|
| 1. Knowledge base construction | 1–6 | Scrape and clean CUET sources across all departments/admission/facilities/achievements/career; build eval set | Full-coverage knowledge base + eval set |
| 2. Retrieval + generation pipeline | 7–11 | Implement R1 (BM25), R2 (dense), R3 (hybrid); wire fixed generation model to all three | Three working retrieval conditions |
| 3. Hallucination-audit integration | 12–15 | Apply self-consistency + NLI + perplexity stack across all three conditions' outputs | Reliability scores for all conditions |
| 4. Evaluation | 16–19 | Run automatic metrics, retrieval accuracy, human evaluation sample | Full comparative results table |
| 5. Analysis and write-up | 20–22 | Analyze ablation results, draft paper sections | Paper draft |
| 6. Release and submission prep | 23–25 | Polish write-up, package knowledge base/eval set/code for public release, submit arXiv preprint, prepare ICCIT submission | arXiv preprint + public dataset/code |

No fine-tuning stage means Phases 2–3 carry meaningfully less compute risk than a fine-tuning-inclusive plan — that saved time is reallocated to broader knowledge-base coverage (Phase 1) and deeper evaluation (Phase 4).

---

## 8. Expected Contributions

1. First controlled retrieval-strategy ablation for a Bangladeshi university RAG assistant, isolating retrieval as the experimental variable.
2. First hallucination-*scoring* (not refusal-based) evaluation layer applied to a Bangladeshi university RAG system.
3. First full-institution-coverage RAG assistant among the compared Bangladeshi systems (vs. CSE-only or handbook-only scope in prior work).
4. Public release: knowledge base, eval set, code, and an arXiv preprint, with ICCIT as the target formal venue.

---

## 9. Team and Roles

*(fill in per team member — suggested split below)*

- **Knowledge base construction & eval set annotation:** —
- **Retrieval conditions R1/R2/R3 implementation:** —
- **Hallucination-audit layer integration:** —
- **Evaluation, analysis, and write-up:** shared

---

## 10. References

1. "Transforming Mentorship: An AI Powered Chatbot Approach to University Guidance." arXiv:2511.04172 (2025).
2. Shaikh, M.A.H., Al Shafi, A. "Towards Developing a Multimodal Chat Assistant for University Stakeholders: RAG-based Approach." arXiv:2607.01115 (2026).
3. Neupane et al. "From Questions to Insightful Answers: Building an Informed Chatbot for University Resources (BARKPLUG v.2)." arXiv:2405.08120 (2024).
4. "KatzBot: Revolutionizing Academic Chatbot for Enhanced Communication." arXiv:2410.16385 (2024).
5. Systematic review of chatbots in education (71 papers). *Computers & Education* (2025). ScienceDirect: S0360131525000910.

*Note: please verify full author lists and page/DOI details from the source links above before final submission.*