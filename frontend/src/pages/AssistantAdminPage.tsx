import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type InstructionItem = {
  id: number;
  institucionId: number | null;
  title: string;
  category: string;
  instruction: string;
  order: number;
  active: boolean;
};

type ModuleGuide = {
  key: string;
  title: string;
  path: string;
  aliases: string[];
  summary: string;
  steps: string[];
};

type DetailGuide = {
  moduleKey: string;
  detailKey: string;
  title: string;
  routePrefix: string;
  aliases: string[];
  summary: string;
  steps: string[];
  validations: string[];
  commonErrors: string[];
  correctiveActions: string[];
};

type ConversationPattern = {
  patternKey: string;
  phrases: string[];
};

type ExampleQuestion = {
  moduleKey: string;
  detailKey?: string | null;
  phrases: string[];
};

type ScreenContext = {
  routePrefix: string;
  moduleKey: string;
  title: string;
  summary: string;
  hints: string[];
  exampleQuestions: string[];
};

type FormGuide = {
  routePrefix: string;
  moduleKey: string;
  formKey: string;
  title: string;
  summary: string;
  aliases: string[];
  fields: Array<{ fieldName: string; required: boolean; hint: string; order: number }>;
};

type SubflowContext = {
  routePrefix: string;
  moduleKey: string;
  subflowKey: string;
  title: string;
  summary: string;
  aliases: string[];
  hints: string[];
  exampleQuestions: string[];
};

type AssistantFaq = {
  faqKey: string;
  moduleKey: string;
  routePrefix: string;
  title: string;
  summary: string;
  answer: string;
  kind: string;
  allowedRoles?: string[];
  questionPatterns: string[];
  steps: string[];
};

type KnowledgePayload = {
  modules: ModuleGuide[];
  details: DetailGuide[];
  conversationPatterns: ConversationPattern[];
  exampleQuestions: ExampleQuestion[];
  screenContexts: ScreenContext[];
  formGuides: FormGuide[];
  subflowContexts: SubflowContext[];
  faqs: AssistantFaq[];
};

const EMPTY_FORM = {
  id: 0,
  title: "",
  category: "GENERAL",
  instruction: "",
  order: 10,
  active: true
};

const EMPTY_DETAIL_FORM = {
  moduleKey: "",
  detailKey: "",
  title: "",
  routePrefix: "",
  summary: "",
  aliasesText: "",
  stepsText: "",
  validationsText: "",
  commonErrorsText: "",
  correctiveActionsText: ""
};

const EMPTY_MODULE_FORM = {
  key: "",
  title: "",
  path: "",
  summary: "",
  aliasesText: "",
  stepsText: ""
};

const EMPTY_CONVERSATION_FORM = {
  patternKey: "",
  phrasesText: ""
};

const EMPTY_SCREEN_FORM = {
  routePrefix: "",
  moduleKey: "",
  title: "",
  summary: "",
  hintsText: "",
  examplesText: ""
};

const EMPTY_FORMGUIDE_FORM = {
  routePrefix: "",
  moduleKey: "",
  formKey: "",
  title: "",
  summary: "",
  aliasesText: "",
  fieldsText: ""
};

const EMPTY_SUBFLOW_FORM = {
  routePrefix: "",
  moduleKey: "",
  subflowKey: "",
  title: "",
  summary: "",
  aliasesText: "",
  hintsText: "",
  examplesText: ""
};

const EMPTY_FAQ_FORM = {
  faqKey: "",
  moduleKey: "",
  routePrefix: "",
  title: "",
  summary: "",
  answer: "",
  kind: "FAQ",
  allowedRolesText: "",
  questionPatternsText: "",
  stepsText: ""
};

const TABS = [
  { key: "indicaciones", label: "Indicaciones" },
  { key: "modulos", label: "Módulos" },
  { key: "detalles", label: "Pantallas y paneles" },
  { key: "conversacion", label: "Conversación" },
  { key: "pantallas", label: "Contextos" },
  { key: "formularios", label: "Formularios" },
  { key: "subflujos", label: "Subflujos" },
  { key: "faqs", label: "FAQ y diagnóstico" }
] as const;

const cardBorder = "1px solid #93c5fd";
const actionButtonStyle: React.CSSProperties = {
  border: "1px solid #2563eb",
  borderRadius: "10px",
  padding: "8px 12px",
  background: "#dbeafe",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 700
};
const assistantTabBaseStyle: React.CSSProperties = {
  borderRadius: "999px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 800,
  transition: "all 0.2s ease"
};
const assistantFieldStyle: React.CSSProperties = {
  border: "1px solid #94a3b8",
  borderRadius: "12px",
  padding: "10px 12px",
  background: "#ffffff",
  color: "#0f172a"
};
const assistantTextareaStyle: React.CSSProperties = {
  ...assistantFieldStyle,
  padding: "12px",
  resize: "vertical"
};

function hasDraftValue(value: string | number | boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return value.trim().length > 0;
}

export default function AssistantAdminPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("indicaciones");
  const [items, setItems] = useState<InstructionItem[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgePayload>({
    modules: [],
    details: [],
    conversationPatterns: [],
    exampleQuestions: [],
    screenContexts: [],
    formGuides: [],
    subflowContexts: [],
    faqs: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [detailForm, setDetailForm] = useState(EMPTY_DETAIL_FORM);
  const [savingDetail, setSavingDetail] = useState(false);
  const [moduleForm, setModuleForm] = useState(EMPTY_MODULE_FORM);
  const [conversationForm, setConversationForm] = useState(EMPTY_CONVERSATION_FORM);
  const [screenForm, setScreenForm] = useState(EMPTY_SCREEN_FORM);
  const [formGuideForm, setFormGuideForm] = useState(EMPTY_FORMGUIDE_FORM);
  const [subflowForm, setSubflowForm] = useState(EMPTY_SUBFLOW_FORM);
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ_FORM);
  const [savingBase, setSavingBase] = useState(false);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [items]
  );

  const editingTab = useMemo(() => {
    if (form.id || hasDraftValue(form.title) || hasDraftValue(form.instruction)) return "indicaciones";
    if (hasDraftValue(moduleForm.key)) return "modulos";
    if (hasDraftValue(detailForm.detailKey)) return "detalles";
    if (hasDraftValue(conversationForm.patternKey)) return "conversacion";
    if (hasDraftValue(screenForm.routePrefix)) return "pantallas";
    if (hasDraftValue(formGuideForm.formKey)) return "formularios";
    if (hasDraftValue(subflowForm.subflowKey)) return "subflujos";
    if (hasDraftValue(faqForm.faqKey)) return "faqs";
    return null;
  }, [form, moduleForm, detailForm, conversationForm, screenForm, formGuideForm, subflowForm, faqForm]);

  async function loadInstructions() {
    const response = await api.get("/assistant/admin/instructions");
    const data = response.data?.data || response.data;
    return Array.isArray(data?.items)
      ? data.items.map((item: any) => ({
          id: Number(item.id || item.AsistenteIndicacionAdminId || 0),
          institucionId: item.institucionId ?? item.InstitucionId ?? null,
          title: String(item.title || item.Título || ""),
          category: String(item.category || item.Categoria || "GENERAL"),
          instruction: String(item.instruction || item.Instruccion || ""),
          order: Number(item.order || item.OrdenVisual || 0),
          active: Boolean(item.active ?? item.Activo)
        }))
      : [];
  }

  async function loadKnowledge() {
    const response = await api.get("/assistant/admin/knowledge");
    const data = response.data?.data || response.data;
    return {
      modules: Array.isArray(data?.modules) ? data.modules : [],
      details: Array.isArray(data?.details) ? data.details : [],
      conversationPatterns: Array.isArray(data?.conversationPatterns) ? data.conversationPatterns : [],
      exampleQuestions: Array.isArray(data?.exampleQuestions) ? data.exampleQuestions : [],
      screenContexts: Array.isArray(data?.screenContexts) ? data.screenContexts : [],
      formGuides: Array.isArray(data?.formGuides) ? data.formGuides : [],
      subflowContexts: Array.isArray(data?.subflowContexts) ? data.subflowContexts : [],
      faqs: Array.isArray(data?.faqs) ? data.faqs : []
    } satisfies KnowledgePayload;
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [instructionItems, knowledgePayload] = await Promise.all([loadInstructions(), loadKnowledge()]);
      setItems(instructionItems);
      setKnowledge(knowledgePayload);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cargar el centro de mantenimiento de Margarita.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function resetDetailForm() {
    setDetailForm(EMPTY_DETAIL_FORM);
  }

  function resetModuleForm() {
    setModuleForm(EMPTY_MODULE_FORM);
  }

  function resetConversationForm() {
    setConversationForm(EMPTY_CONVERSATION_FORM);
  }

  function resetScreenForm() {
    setScreenForm(EMPTY_SCREEN_FORM);
  }

  function resetFormGuideForm() {
    setFormGuideForm(EMPTY_FORMGUIDE_FORM);
  }

  function resetSubflowForm() {
    setSubflowForm(EMPTY_SUBFLOW_FORM);
  }

  function resetFaqForm() {
    setFaqForm(EMPTY_FAQ_FORM);
  }

  function prepareOverride(category: string, title: string, instruction: string, order = 50) {
    setForm({
      id: 0,
      title,
      category,
      instruction,
      order,
      active: true
    });
    setActiveTab("indicaciones");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(item: InstructionItem) {
    setForm({
      id: item.id,
      title: item.title,
      category: item.category,
      instruction: item.instruction,
      order: item.order,
      active: item.active
    });
    setActiveTab("indicaciones");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditDetail(item: DetailGuide) {
    setDetailForm({
      moduleKey: item.moduleKey,
      detailKey: item.detailKey,
      title: item.title,
      routePrefix: item.routePrefix,
      summary: item.summary,
      aliasesText: item.aliases.join("\n"),
      stepsText: item.steps.join("\n"),
      validationsText: item.validations.join("\n"),
      commonErrorsText: item.commonErrors.join("\n"),
      correctiveActionsText: item.correctiveActions.join("\n")
    });
    setActiveTab("detalles");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditModule(item: ModuleGuide) {
    setModuleForm({
      key: item.key,
      title: item.title,
      path: item.path,
      summary: item.summary,
      aliasesText: item.aliases.join("\n"),
      stepsText: item.steps.join("\n")
    });
    setActiveTab("modulos");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditConversation(item: ConversationPattern) {
    setConversationForm({
      patternKey: item.patternKey,
      phrasesText: item.phrases.join("\n")
    });
    setActiveTab("conversacion");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditScreen(item: ScreenContext) {
    setScreenForm({
      routePrefix: item.routePrefix,
      moduleKey: item.moduleKey,
      title: item.title,
      summary: item.summary,
      hintsText: item.hints.join("\n"),
      examplesText: item.exampleQuestions.join("\n")
    });
    setActiveTab("pantallas");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditFormGuide(item: FormGuide) {
    setFormGuideForm({
      routePrefix: item.routePrefix,
      moduleKey: item.moduleKey,
      formKey: item.formKey,
      title: item.title,
      summary: item.summary,
      aliasesText: item.aliases.join("\n"),
      fieldsText: item.fields
        .sort((a, b) => a.order - b.order)
        .map((field) => `${field.order}|${field.fieldName}|${field.required ? "si" : "no"}|${field.hint}`)
        .join("\n")
    });
    setActiveTab("formularios");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditSubflow(item: SubflowContext) {
    setSubflowForm({
      routePrefix: item.routePrefix,
      moduleKey: item.moduleKey,
      subflowKey: item.subflowKey,
      title: item.title,
      summary: item.summary,
      aliasesText: item.aliases.join("\n"),
      hintsText: item.hints.join("\n"),
      examplesText: item.exampleQuestions.join("\n")
    });
    setActiveTab("subflujos");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditFaq(item: AssistantFaq) {
    setFaqForm({
      faqKey: item.faqKey,
      moduleKey: item.moduleKey,
      routePrefix: item.routePrefix,
      title: item.title,
      summary: item.summary,
      answer: item.answer,
      kind: item.kind || "FAQ",
      allowedRolesText: (item.allowedRoles || []).join("\n"),
      questionPatternsText: item.questionPatterns.join("\n"),
      stepsText: item.steps.join("\n")
    });
    setActiveTab("faqs");
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        title: form.title,
        category: form.category,
        instruction: form.instruction,
        order: form.order,
        active: form.active
      };

      if (form.id) {
        await api.put(`/assistant/admin/instructions/${form.id}`, payload);
        setMessage("Indicación actualizada correctamente.");
      } else {
        await api.post("/assistant/admin/instructions", payload);
        setMessage("Indicación agregada correctamente.");
      }

      resetForm();
      setItems(await loadInstructions());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo guardar la indicación.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(item: InstructionItem) {
    if (!window.confirm(`Vas a quitar la indicación "${item.title}". ¿Deseás continuar?`)) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`/assistant/admin/instructions/${item.id}`);
      setMessage("Indicación quitada correctamente.");
      if (form.id === item.id) resetForm();
      setItems(await loadInstructions());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo quitar la indicación.");
    }
  }

  async function handleSaveDetail() {
    setSavingDetail(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        title: detailForm.title,
        routePrefix: detailForm.routePrefix,
        summary: detailForm.summary,
        aliases: detailForm.aliasesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        steps: detailForm.stepsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        validations: detailForm.validationsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        commonErrors: detailForm.commonErrorsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        correctiveActions: detailForm.correctiveActionsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      };

      await api.put(`/assistant/admin/detail-guides/${detailForm.moduleKey}/${detailForm.detailKey}`, payload);
      setMessage("Panel base actualizado correctamente.");
      resetDetailForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el panel base.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function handleSaveModule() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      await api.put("/assistant/admin/module-guides", {
        key: moduleForm.key,
        title: moduleForm.title,
        path: moduleForm.path,
        summary: moduleForm.summary,
        aliases: moduleForm.aliasesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        steps: moduleForm.stepsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      });
      setMessage("Módulo base actualizado correctamente.");
      resetModuleForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el módulo base.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleSaveConversation() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      await api.put("/assistant/admin/conversation-patterns", {
        patternKey: conversationForm.patternKey,
        phrases: conversationForm.phrasesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      });
      setMessage("Patrón conversacional actualizado correctamente.");
      resetConversationForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el patrón conversacional.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleSaveScreen() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      await api.put("/assistant/admin/screen-contexts", {
        routePrefix: screenForm.routePrefix,
        moduleKey: screenForm.moduleKey,
        title: screenForm.title,
        summary: screenForm.summary,
        hints: screenForm.hintsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        exampleQuestions: screenForm.examplesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      });
      setMessage("Contexto de pantalla actualizado correctamente.");
      resetScreenForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el contexto de pantalla.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleSaveFormGuide() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      const fields = formGuideForm.fieldsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [orderText, fieldName, requiredText, hint] = line.split("|");
          return {
            order: Number(orderText || index + 1),
            fieldName: String(fieldName || "").trim(),
            required: /^(si|sí|true|1)$/i.test(String(requiredText || "").trim()),
            hint: String(hint || "").trim()
          };
        });

      await api.put("/assistant/admin/form-guides", {
        routePrefix: formGuideForm.routePrefix,
        moduleKey: formGuideForm.moduleKey,
        formKey: formGuideForm.formKey,
        title: formGuideForm.title,
        summary: formGuideForm.summary,
        aliases: formGuideForm.aliasesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        fields
      });
      setMessage("Formulario base actualizado correctamente.");
      resetFormGuideForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el formulario base.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleSaveSubflow() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      await api.put("/assistant/admin/subflow-contexts", {
        routePrefix: subflowForm.routePrefix,
        moduleKey: subflowForm.moduleKey,
        subflowKey: subflowForm.subflowKey,
        title: subflowForm.title,
        summary: subflowForm.summary,
        aliases: subflowForm.aliasesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        hints: subflowForm.hintsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        exampleQuestions: subflowForm.examplesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      });
      setMessage("Subflujo base actualizado correctamente.");
      resetSubflowForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar el subflujo base.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleSaveFaq() {
    setSavingBase(true);
    setMessage("");
    setError("");
    try {
      await api.put("/assistant/admin/faqs", {
        faqKey: faqForm.faqKey,
        moduleKey: faqForm.moduleKey,
        routePrefix: faqForm.routePrefix,
        title: faqForm.title,
        summary: faqForm.summary,
        answer: faqForm.answer,
        kind: faqForm.kind,
        allowedRoles: faqForm.allowedRolesText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        questionPatterns: faqForm.questionPatternsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
        steps: faqForm.stepsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      });
      setMessage("FAQ o diagnóstico actualizado correctamente.");
      resetFaqForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar la FAQ de Margarita.");
    } finally {
      setSavingBase(false);
    }
  }

  async function handleRemoveFaq(item: AssistantFaq) {
    if (!window.confirm(`Vas a quitar la FAQ "${item.title}". ¿Deseás continuar?`)) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`/assistant/admin/faqs/${item.faqKey}`);
      setMessage("FAQ quitada correctamente.");
      if (faqForm.faqKey === item.faqKey) resetFaqForm();
      setKnowledge(await loadKnowledge());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo quitar la FAQ.");
    }
  }

  function renderKnowledgeCard(title: string, summary: string, bullets: string[], action?: React.ReactNode) {
    return (
      <div
        style={{
          display: "grid",
          gap: "12px",
          padding: "16px 18px",
          borderRadius: "16px",
          border: cardBorder,
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
          boxShadow: "0 8px 20px rgba(37,99,235,0.08)"
        }}
      >
        <div style={{ display: "grid", gap: "5px" }}>
          <strong style={{ color: "#0f172a", fontSize: "17px" }}>{title}</strong>
          <span style={{ color: "#334155", fontWeight: 500 }}>{summary}</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: "18px", color: "#0f172a", lineHeight: 1.55 }}>
          {bullets.map((bullet, index) => (
            <li key={`${title}-${index}`}>{bullet}</li>
          ))}
        </ul>
        {action ? <div>{action}</div> : null}
      </div>
    );
  }

  function renderInfoBanner(text: string) {
    return (
      <div
        style={{
          color: "#1e3a8a",
          fontWeight: 700,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          padding: "12px 14px",
          borderRadius: "14px"
        }}
      >
        {text}
      </div>
    );
  }

  function renderIndicacionesTab() {
    return (
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={{ display: "grid", gap: "12px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ fontSize: "18px", color: "#0f172a" }}>
              {form.id ? "Editar indicación" : "Nueva indicación para Margarita"}
            </strong>
            <span style={{ color: "#1e3a8a", fontWeight: 600 }}>
              Aquí sí podés agregar, modificar o quitar indicaciones. También podés llegar aquí desde las otras pestañas usando los botones de refuerzo.
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.5fr", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
              Título
              <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 12px", color: "#0f172a", background: "#ffffff" }} />
            </label>
            <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
              Categoría
              <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 12px", color: "#0f172a", background: "#ffffff" }}>
                <option value="GENERAL">General</option>
                <option value="TONO">Tono</option>
                <option value="GUIA">Guía</option>
                <option value="ADMINISTRATIVO">Administrativo</option>
                <option value="DOCENTE">Docente</option>
                <option value="RESTRICCION">Restricción</option>
                <option value="PANTALLA">Pantalla</option>
                <option value="FORMULARIO">Formulario</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
              Orden
              <input type="number" value={form.order} onChange={(e) => setForm((prev) => ({ ...prev, order: Number(e.target.value || 0) }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 12px", color: "#0f172a", background: "#ffffff" }} />
            </label>
          </div>

          <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
            Indicación
            <textarea
              rows={5}
              value={form.instruction}
              onChange={(e) => setForm((prev) => ({ ...prev, instruction: e.target.value }))}
              placeholder="Ejemplo: Si la persona pregunta por Administrativo, primero explícale el orden correcto entre Año Lectivo, Períodos, Gestión de grupos, Materias por grupo y Asignación de docentes."
              style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", resize: "vertical", color: "#0f172a", background: "#ffffff" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0f172a", fontWeight: 700 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            Activa
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : form.id ? "Actualizar indicación" : "Agregar indicación"}
            </button>
            <button type="button" onClick={resetForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}>
              Limpiar
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <strong style={{ fontSize: "18px", color: "#0f172a" }}>Indicaciones actuales</strong>
          {!sortedItems.length ? (
            <div style={{ padding: "16px", borderRadius: "14px", background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", fontWeight: 700 }}>
              No hay indicaciones cargadas todavía.
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: cardBorder, borderRadius: "16px", background: "#ffffff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
                <thead>
                  <tr style={{ background: "#dbeafe", color: "#0f172a" }}>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Orden</th>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Título</th>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Categoría</th>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Indicación</th>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Estado</th>
                    <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid #93c5fd" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <tr key={item.id} style={{ background: item.active ? "#ffffff" : "#f8fafc" }}>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 600 }}>{item.order}</td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 800 }}>{item.title}</td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 600 }}>{item.category}</td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0", color: "#1e293b" }}>{item.instruction}</td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: "999px", background: item.active ? "#dcfce7" : "#e5e7eb", color: item.active ? "#166534" : "#475569", fontWeight: 800 }}>
                          {item.active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button type="button" onClick={() => startEdit(item)} style={actionButtonStyle}>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemove(item)}
                            style={{ border: "1px solid #fecaca", borderRadius: "10px", padding: "8px 12px", background: "#fef2f2", color: "#b91c1c", cursor: "pointer", fontWeight: 800 }}
                          >
                            Quitar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderModulesTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner("Aquí ves la base de módulos de Margarita. Si querés ajustar algo, usá el botón de cada bloque para crear una indicación de refuerzo.")}
        {moduleForm.key ? (
          <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Editar base del módulo</strong>
            <input value={moduleForm.title} onChange={(e) => setModuleForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" style={assistantFieldStyle} />
            <input value={moduleForm.path} onChange={(e) => setModuleForm((prev) => ({ ...prev, path: e.target.value }))} placeholder="Ruta" style={assistantFieldStyle} />
            <textarea rows={3} value={moduleForm.summary} onChange={(e) => setModuleForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Resumen" style={assistantTextareaStyle} />
            <textarea rows={4} value={moduleForm.aliasesText} onChange={(e) => setModuleForm((prev) => ({ ...prev, aliasesText: e.target.value }))} placeholder="Alias, uno por línea" style={assistantTextareaStyle} />
            <textarea rows={5} value={moduleForm.stepsText} onChange={(e) => setModuleForm((prev) => ({ ...prev, stepsText: e.target.value }))} placeholder="Pasos, uno por línea" style={assistantTextareaStyle} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveModule()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar base del módulo"}</button>
              <button type="button" onClick={resetModuleForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {knowledge.modules.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.key})`,
            `${item.summary} Ruta: ${item.path}`,
            [`Aliases: ${item.aliases.join(", ") || "Sin aliases"}`, ...item.steps.map((step, index) => `Paso ${index + 1}: ${step}`)],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditModule(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => prepareOverride("GUIA", `Refuerzo de módulo: ${item.title}`, `Cuando la persona esté trabajando con el módulo ${item.title}, explícale primero este resumen y luego el paso a paso correcto: ${item.steps.join(" | ")}`, 40)} style={actionButtonStyle}>Crear indicación sobre este módulo</button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderDetailsTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner("Aquí ves paneles y pestañas que ya conoce Margarita. Desde cada bloque podés crear un refuerzo directo.")}
        {detailForm.detailKey ? (
          <div style={{ display: "grid", gap: "12px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong style={{ fontSize: "18px", color: "#0f172a" }}>Editar base del panel</strong>
              <span style={{ color: "#1e3a8a", fontWeight: 700 }}>
                Aquí sí estás cambiando la base real del panel. Lo que guardes se reflejará en Margarita sin pasar por refuerzo.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Título
                <input value={detailForm.title} onChange={(e) => setDetailForm((prev) => ({ ...prev, title: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 12px", background: "#fff", color: "#0f172a" }} />
              </label>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Ruta
                <input value={detailForm.routePrefix} onChange={(e) => setDetailForm((prev) => ({ ...prev, routePrefix: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 12px", background: "#fff", color: "#0f172a" }} />
              </label>
            </div>

            <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
              Resumen
              <textarea rows={3} value={detailForm.summary} onChange={(e) => setDetailForm((prev) => ({ ...prev, summary: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Alias (uno por línea)
                <textarea rows={4} value={detailForm.aliasesText} onChange={(e) => setDetailForm((prev) => ({ ...prev, aliasesText: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
              </label>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Pasos (uno por línea)
                <textarea rows={4} value={detailForm.stepsText} onChange={(e) => setDetailForm((prev) => ({ ...prev, stepsText: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Validaciones (una por línea)
                <textarea rows={4} value={detailForm.validationsText} onChange={(e) => setDetailForm((prev) => ({ ...prev, validationsText: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
              </label>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Error común (uno por línea)
                <textarea rows={4} value={detailForm.commonErrorsText} onChange={(e) => setDetailForm((prev) => ({ ...prev, commonErrorsText: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
              </label>
            </div>

            <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
              Si pasa esto, hace esto otro (una por línea)
              <textarea rows={4} value={detailForm.correctiveActionsText} onChange={(e) => setDetailForm((prev) => ({ ...prev, correctiveActionsText: e.target.value }))} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "12px", background: "#fff", color: "#0f172a", resize: "vertical" }} />
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveDetail()} disabled={savingDetail}>
                {savingDetail ? "Guardando base..." : "Guardar base del panel"}
              </button>
              <button type="button" onClick={resetDetailForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
        {knowledge.details.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.moduleKey})`,
            `${item.summary} Ruta: ${item.routePrefix}`,
            [
              `Aliases: ${item.aliases.join(", ") || "Sin aliases"}`,
              ...item.steps.map((step, index) => `Paso ${index + 1}: ${step}`),
              ...item.validations.map((value) => `Validacion: ${value}`),
              ...item.commonErrors.map((value) => `Error común: ${value}`),
              ...item.correctiveActions.map((value) => `Accion correctiva: ${value}`)
            ],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => startEditDetail(item)}
                style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}
              >
                Editar base
              </button>
              <button
                type="button"
                onClick={() =>
                  prepareOverride(
                    "PANTALLA",
                    `Refuerzo de panel: ${item.title}`,
                    `Cuando la persona consulte por ${item.title}, enfatiza estas validaciones y errores comunes: ${[...item.validations, ...item.commonErrors, ...item.correctiveActions].join(" | ")}`,
                    45
                  )
                }
                style={actionButtonStyle}
              >
                Crear indicación sobre este panel
              </button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderConversationTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner("Aquí ves patrones conversacionales y ejemplos que ya disparan respuestas especiales de Margarita.")}
        {conversationForm.patternKey ? (
          <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Editar base conversacional</strong>
            <input value={conversationForm.patternKey} disabled style={{ ...assistantFieldStyle, background: "#e2e8f0" }} />
            <textarea rows={6} value={conversationForm.phrasesText} onChange={(e) => setConversationForm((prev) => ({ ...prev, phrasesText: e.target.value }))} placeholder="Frases, una por línea" style={assistantTextareaStyle} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveConversation()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar patrón conversacional"}</button>
              <button type="button" onClick={resetConversationForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {knowledge.conversationPatterns.map((item) =>
          renderKnowledgeCard(
            item.patternKey,
            "Este patrón agrupa frases que Margarita reconoce como una misma intención.",
            item.phrases,
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditConversation(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => prepareOverride("TONO", `Refuerzo conversacional: ${item.patternKey}`, `Cuando Margarita detecte el patrón ${item.patternKey}, reforzá esta forma de respuesta según estas frases: ${item.phrases.join(" | ")}`, 50)} style={actionButtonStyle}>Crear indicación sobre este patrón</button>
            </div>
          )
        )}
        {knowledge.exampleQuestions.map((item) =>
          renderKnowledgeCard(
            `Ejemplos ${item.moduleKey}${item.detailKey ? ` / ${item.detailKey}` : ""}`,
            "Preguntas de ejemplo usadas para el módulo o detalle.",
            item.phrases
          )
        )}
      </div>
    );
  }

  function renderScreenContextsTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner("Aquí ves lo que Margarita entiende cuando la persona pregunta por la pantalla actual.")}
        {screenForm.routePrefix ? (
          <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Editar base del contexto</strong>
            <input value={screenForm.title} onChange={(e) => setScreenForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" style={assistantFieldStyle} />
            <input value={screenForm.routePrefix} onChange={(e) => setScreenForm((prev) => ({ ...prev, routePrefix: e.target.value }))} placeholder="Ruta" style={assistantFieldStyle} />
            <input value={screenForm.moduleKey} onChange={(e) => setScreenForm((prev) => ({ ...prev, moduleKey: e.target.value }))} placeholder="Módulo" style={assistantFieldStyle} />
            <textarea rows={3} value={screenForm.summary} onChange={(e) => setScreenForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Resumen" style={assistantTextareaStyle} />
            <textarea rows={4} value={screenForm.hintsText} onChange={(e) => setScreenForm((prev) => ({ ...prev, hintsText: e.target.value }))} placeholder="Pistas, una por línea" style={assistantTextareaStyle} />
            <textarea rows={4} value={screenForm.examplesText} onChange={(e) => setScreenForm((prev) => ({ ...prev, examplesText: e.target.value }))} placeholder="Ejemplos, uno por línea" style={assistantTextareaStyle} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveScreen()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar contexto de pantalla"}</button>
              <button type="button" onClick={resetScreenForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {knowledge.screenContexts.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.routePrefix})`,
            item.summary,
            [...item.hints.map((hint) => `Hint: ${hint}`), ...item.exampleQuestions.map((question) => `Ejemplo: ${question}`)],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditScreen(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => prepareOverride("PANTALLA", `Refuerzo de contexto: ${item.title}`, `Si la persona está en ${item.title}, priorizá estas ayudas: ${item.hints.join(" | ")}`, 55)} style={actionButtonStyle}>Crear indicación sobre este contexto</button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderFormsTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner("Aquí ves el orden sugerido de campos cuando Margarita ayuda a llenar formularios.")}
        {formGuideForm.formKey ? (
          <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Editar base del formulario</strong>
            <input value={formGuideForm.title} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" style={assistantFieldStyle} />
            <input value={formGuideForm.routePrefix} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, routePrefix: e.target.value }))} placeholder="Ruta" style={assistantFieldStyle} />
            <input value={formGuideForm.moduleKey} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, moduleKey: e.target.value }))} placeholder="Módulo" style={assistantFieldStyle} />
            <textarea rows={3} value={formGuideForm.summary} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Resumen" style={assistantTextareaStyle} />
            <textarea rows={4} value={formGuideForm.aliasesText} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, aliasesText: e.target.value }))} placeholder="Alias, uno por línea" style={assistantTextareaStyle} />
            <textarea rows={6} value={formGuideForm.fieldsText} onChange={(e) => setFormGuideForm((prev) => ({ ...prev, fieldsText: e.target.value }))} placeholder="Campos: orden|nombre|si/no|ayuda" style={assistantTextareaStyle} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveFormGuide()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar formulario base"}</button>
              <button type="button" onClick={resetFormGuideForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {knowledge.formGuides.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.routePrefix})`,
            item.summary,
            [
              `Aliases: ${item.aliases.join(", ") || "Sin aliases"}`,
              ...item.fields.sort((a, b) => a.order - b.order).map((field) => `${field.order}. ${field.fieldName}${field.required ? " (Requerido)" : ""}: ${field.hint}`)
            ],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditFormGuide(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => prepareOverride("FORMULARIO", `Refuerzo de formulario: ${item.title}`, `Cuando la persona llene ${item.title}, explícale este orden de campos: ${item.fields.sort((a, b) => a.order - b.order).map((field) => `${field.fieldName}${field.required ? " requerido" : ""}`).join(" | ")}`, 60)} style={actionButtonStyle}>Crear indicación sobre este formulario</button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderSubflowsTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner('Aquí ves los subflujos activos que Margarita usa cuando alguien pregunta "qué hago acá" o "ahora qué sigue".')}
        {subflowForm.subflowKey ? (
          <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Editar base del subflujo</strong>
            <input value={subflowForm.title} onChange={(e) => setSubflowForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" style={assistantFieldStyle} />
            <input value={subflowForm.routePrefix} onChange={(e) => setSubflowForm((prev) => ({ ...prev, routePrefix: e.target.value }))} placeholder="Ruta" style={assistantFieldStyle} />
            <input value={subflowForm.moduleKey} onChange={(e) => setSubflowForm((prev) => ({ ...prev, moduleKey: e.target.value }))} placeholder="Módulo" style={assistantFieldStyle} />
            <textarea rows={3} value={subflowForm.summary} onChange={(e) => setSubflowForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Resumen" style={assistantTextareaStyle} />
            <textarea rows={4} value={subflowForm.aliasesText} onChange={(e) => setSubflowForm((prev) => ({ ...prev, aliasesText: e.target.value }))} placeholder="Alias, uno por línea" style={assistantTextareaStyle} />
            <textarea rows={4} value={subflowForm.hintsText} onChange={(e) => setSubflowForm((prev) => ({ ...prev, hintsText: e.target.value }))} placeholder="Pistas, una por línea" style={assistantTextareaStyle} />
            <textarea rows={4} value={subflowForm.examplesText} onChange={(e) => setSubflowForm((prev) => ({ ...prev, examplesText: e.target.value }))} placeholder="Ejemplos, uno por línea" style={assistantTextareaStyle} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" type="button" onClick={() => void handleSaveSubflow()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar subflujo base"}</button>
              <button type="button" onClick={resetSubflowForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {knowledge.subflowContexts.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.routePrefix})`,
            item.summary,
            [`Aliases: ${item.aliases.join(", ") || "Sin aliases"}`, ...item.hints.map((hint) => `Hint: ${hint}`), ...item.exampleQuestions.map((question) => `Ejemplo: ${question}`)],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditSubflow(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => prepareOverride("GUIA", `Refuerzo de subflujo: ${item.title}`, `Cuando la persona esté en el subflujo ${item.title}, refuerza estas ayudas: ${item.hints.join(" | ")}`, 65)} style={actionButtonStyle}>Crear indicación sobre este subflujo</button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderFaqsTab() {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {renderInfoBanner('Aquí definís respuestas directas y chequeos de diagnóstico para que Margarita resuelva dudas frecuentes como "no me aparece", "no me deja" o "cómo hago".')}
        <div style={{ display: "grid", gap: "10px", padding: "16px", borderRadius: "16px", border: cardBorder, background: "#eff6ff" }}>
          <strong style={{ color: "#0f172a", fontSize: "18px" }}>{faqForm.faqKey ? "Editar FAQ o diagnóstico" : "Nueva FAQ o diagnóstico"}</strong>
          <input value={faqForm.faqKey} onChange={(e) => setFaqForm((prev) => ({ ...prev, faqKey: e.target.value }))} placeholder="Clave única" style={assistantFieldStyle} />
            <input value={faqForm.moduleKey} onChange={(e) => setFaqForm((prev) => ({ ...prev, moduleKey: e.target.value }))} placeholder="Módulo" style={assistantFieldStyle} />
          <input value={faqForm.routePrefix} onChange={(e) => setFaqForm((prev) => ({ ...prev, routePrefix: e.target.value }))} placeholder="Ruta" style={assistantFieldStyle} />
          <input value={faqForm.title} onChange={(e) => setFaqForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" style={assistantFieldStyle} />
          <select value={faqForm.kind} onChange={(e) => setFaqForm((prev) => ({ ...prev, kind: e.target.value }))} style={assistantFieldStyle}>
            <option value="FAQ">FAQ</option>
            <option value="DIAGNOSTICO">Diagnóstico</option>
          </select>
          <textarea rows={3} value={faqForm.summary} onChange={(e) => setFaqForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Resumen corto" style={assistantTextareaStyle} />
          <textarea rows={5} value={faqForm.answer} onChange={(e) => setFaqForm((prev) => ({ ...prev, answer: e.target.value }))} placeholder="Respuesta principal" style={assistantTextareaStyle} />
          <textarea rows={4} value={faqForm.allowedRolesText} onChange={(e) => setFaqForm((prev) => ({ ...prev, allowedRolesText: e.target.value }))} placeholder="Roles permitidos, uno por línea. Vacío = todos" style={assistantTextareaStyle} />
          <textarea rows={5} value={faqForm.questionPatternsText} onChange={(e) => setFaqForm((prev) => ({ ...prev, questionPatternsText: e.target.value }))} placeholder="Patrones o preguntas gatillo, uno por línea" style={assistantTextareaStyle} />
          <textarea rows={5} value={faqForm.stepsText} onChange={(e) => setFaqForm((prev) => ({ ...prev, stepsText: e.target.value }))} placeholder="Pasos o chequeos sugeridos, uno por línea" style={assistantTextareaStyle} />
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" type="button" onClick={() => void handleSaveFaq()} disabled={savingBase}>{savingBase ? "Guardando..." : "Guardar FAQ"}</button>
            <button type="button" onClick={resetFaqForm} style={{ border: "1px solid #94a3b8", borderRadius: "12px", padding: "10px 14px", background: "#fff", color: "#0f172a", fontWeight: 700 }}>Cancelar</button>
          </div>
        </div>
        {knowledge.faqs.map((item) =>
          renderKnowledgeCard(
            `${item.title} (${item.kind})`,
            `${item.summary || "Sin resumen"} Ruta: ${item.routePrefix} / Módulo: ${item.moduleKey}`,
            [
              `Roles: ${(item.allowedRoles || []).join(", ") || "Todos"}`,
              `Patrones: ${item.questionPatterns.join(" | ") || "Sin patrones"}`,
              `Respuesta: ${item.answer}`,
              ...item.steps.map((step, index) => `Paso ${index + 1}: ${step}`)
            ],
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEditFaq(item)} style={{ ...actionButtonStyle, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>Editar base</button>
              <button type="button" onClick={() => void handleRemoveFaq(item)} style={{ ...actionButtonStyle, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>Quitar</button>
              <button type="button" onClick={() => prepareOverride("FAQ", `Refuerzo FAQ: ${item.title}`, `Cuando la persona pregunte algo cercano a ${item.questionPatterns.join(" | ")}, reforzá esta respuesta: ${item.answer}`, 70)} style={actionButtonStyle}>Crear indicación sobre esta FAQ</button>
            </div>
          )
        )}
      </div>
    );
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "indicaciones":
        return renderIndicacionesTab();
      case "modulos":
        return renderModulesTab();
      case "detalles":
        return renderDetailsTab();
      case "conversacion":
        return renderConversationTab();
      case "pantallas":
        return renderScreenContextsTab();
      case "formularios":
        return renderFormsTab();
      case "subflujos":
        return renderSubflowsTab();
      case "faqs":
        return renderFaqsTab();
      default:
        return null;
    }
  }

  return (
    <section className="card" style={{ display: "grid", gap: "18px", background: "#ffffff", color: "#0f172a" }}>
      <div style={{ display: "grid", gap: "8px", padding: "18px", borderRadius: "18px", background: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)", border: cardBorder }}>
        <h2 style={{ margin: 0, color: "#0f172a" }}>Admin</h2>
        <p style={{ margin: 0, color: "#1e3a8a", fontWeight: 700 }}>
          Aquí administrás la ayuda de Margarita. Podés ver lo que ya sabe, crear indicaciones nuevas y usar cada bloque como base para reforzar respuestas sin tocar código.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              ...assistantTabBaseStyle,
              border: "1px solid #2563eb",
              background: "#1d4ed8",
              color: "#ffffff",
              cursor: "default",
              boxShadow: "0 8px 18px rgba(29,78,216,0.18)"
            }}
          >
            Margarita
          </button>
        </div>
      </div>

      {message ? (
        <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#ecfdf3", color: "#166534", border: "1px solid #86efac", fontWeight: 700 }}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "12px",
          borderRadius: "18px",
          background: "#e0f2fe",
          border: "1px solid #bae6fd"
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...assistantTabBaseStyle,
              border: activeTab === tab.key ? "2px solid #1d4ed8" : "1px solid #7dd3fc",
              background: activeTab === tab.key ? "#1d4ed8" : "#f0f9ff",
              color:
                activeTab === tab.key
                  ? "#ffffff"
                  : editingTab === tab.key
                    ? "#b45309"
                    : "#0c4a6e",
              boxShadow: activeTab === tab.key ? "0 8px 18px rgba(29,78,216,0.18)" : "none"
            }}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void loadAll()}
          style={{
            ...assistantTabBaseStyle,
            border: "1px solid #7dd3fc",
            background: "#ffffff",
            color: "#0c4a6e"
          }}
        >
          Recargar todo
        </button>
      </div>

      {activeTab !== "indicaciones" ? (
        <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 700 }}>
          En estas pestañas ves la base que ya trae Margarita. Si querés ajustarla, usá el botón de cada bloque para crear una indicación nueva y reforzar ese comportamiento.
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: "16px", borderRadius: "14px", background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", fontWeight: 700 }}>
          Cargando mantenimiento de Margarita...
        </div>
      ) : (
        renderActiveTab()
      )}
    </section>
  );
}
