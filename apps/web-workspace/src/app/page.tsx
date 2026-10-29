"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  PenLine,
  Plus,
  Shield,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AttachmentProtectedChip } from "@/components/attachment-protected";
import {
  AssistantActions,
  UserPrivacyStrip,
} from "@/components/message-privacy";
import { ModelPicker } from "@/components/model-picker";
import { ThreadRowMenu } from "@/components/thread-row-menu";
import { WorkspaceDlpPanel } from "@/components/workspace-dlp-panel";
import {
  cycleThemePreference,
  readStoredThemePreference,
  resolveTheme,
  themePreferenceLabel,
  type StoaAdminTheme,
  type StoaThemePreference,
} from "@/lib/stoa-admin-theme";
import { idApi } from "@/lib/id-api";
import {
  createThread,
  deleteThread,
  editMessage,
  fetchModels,
  fetchSession,
  listMessages,
  listThreads,
  sendMessage,
  updateThreadModel,
  updateThreadTitle,
  uploadAttachment,
  type ChatMessage,
  type SessionInfo,
  type StoaModel,
  type MessageAttachment,
  type ThreadSummary,
} from "@/lib/stoa-client";

import styles from "./workspace.module.css";

const ACTIVE_THREAD_STORAGE_KEY = "stoa.workspace.activeThreadId";
const SIDEBAR_COLLAPSED_KEY = "stoa.workspace.sidebarCollapsed";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [models, setModels] = useState<StoaModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<MessageAttachment[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dlpOpen, setDlpOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<StoaAdminTheme>("light");
  const [themePreference, setThemePreference] =
    useState<StoaThemePreference>("system");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [sidebarTitleDraft, setSidebarTitleDraft] = useState("");
  const activeIdRef = useRef<string | null>(null);
  const editingMessageIdRef = useRef<string | null>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const chat = session?.workspaceChat;
  const chatReady = chat?.ready === true && models.length > 0;
  const isAdmin = session?.isAdmin === true;
  const setupPhase = chat?.setupPhase ?? "need_provider";

  useEffect(() => {
    setThemePreference(readStoredThemePreference() ?? "system");
    setTheme(resolveTheme());
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "l") {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const refreshAll = useCallback(async () => {
    const [me, modelList, threadList] = await Promise.all([
      fetchSession(),
      fetchModels(),
      listThreads(),
    ]);
    setSession(me);
    setModels(modelList);
    setDefaultModelId(
      me.workspaceChat?.defaultModelId ?? modelList[0]?.id ?? "",
    );
    setThreads(threadList);
    return { me, modelList, threadList };
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    editingMessageIdRef.current = editingMessageId;
  }, [editingMessageId]);

  useEffect(() => {
    refreshAll()
      .then(({ threadList }) => {
        if (threadList.length === 0) {
          return;
        }
        const stored =
          typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem(ACTIVE_THREAD_STORAGE_KEY)
            : null;
        setActiveId((current) => {
          if (current && threadList.some((t) => t.id === current)) {
            return current;
          }
          if (stored && threadList.some((t) => t.id === stored)) {
            return stored;
          }
          return threadList[0].id;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [refreshAll]);

  useEffect(() => {
    if (!activeId || typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, activeId);
  }, [activeId]);

  useEffect(() => {
    const onFocus = () => {
      void refreshAll().then(() => {
        const id = activeIdRef.current;
        if (!id || editingMessageIdRef.current) {
          return;
        }
        void listMessages(id)
          .then(setMessages)
          .catch((e: Error) => setError(e.message));
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshAll]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setEditingMessageId(null);
    setEditDraft("");
    listMessages(activeId)
      .then((loaded) => {
        setMessages(loaded);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeId ? { ...t, messageCount: loaded.length } : t,
          ),
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [activeId]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function onMessagesScroll() {
    const el = messagesRef.current;
    if (!el) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 80;
    stickToBottomRef.current = nearBottom;
    setShowJumpDown(!nearBottom && messages.length > 0);
  }

  function jumpToBottom() {
    stickToBottomRef.current = true;
    setShowJumpDown(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  async function handleNewChat() {
    if (!chatReady) {
      setError("Chat isn't available yet.");
      return;
    }
    setError(null);
    try {
      const modelId = defaultModelId || models[0]?.id;
      if (!modelId) {
        setError("No model available.");
        return;
      }
      const thread = await createThread(modelId);
      if (thread.reused) {
        setActiveId(thread.id);
        const loaded = await listMessages(thread.id);
        setMessages(loaded);
        setThreads((prev) => {
          const rest = prev.filter((t) => t.id !== thread.id);
          return [
            { ...thread, messageCount: loaded.length },
            ...rest,
          ];
        });
        return;
      }
      setThreads((prev) => [thread, ...prev]);
      setActiveId(thread.id);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteThread(threadId: string) {
    if (!confirm("Delete this chat? This can't be undone.")) {
      return;
    }
    setError(null);
    try {
      await deleteThread(threadId);
      const next = threads.filter((t) => t.id !== threadId);
      setThreads(next);
      if (activeId === threadId) {
        setActiveId(next[0]?.id ?? null);
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commitTitleRename(threadId?: string) {
    const id = threadId ?? activeId;
    if (!id) {
      setEditingTitle(false);
      setRenamingThreadId(null);
      return;
    }
    const draft = threadId ? sidebarTitleDraft : titleDraft;
    const next = draft.trim();
    if (!next) {
      setEditingTitle(false);
      setRenamingThreadId(null);
      return;
    }
    setEditingTitle(false);
    setRenamingThreadId(null);
    try {
      await updateThreadTitle(id, next);
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: next } : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startSidebarRename(threadId: string, title: string) {
    setRenamingThreadId(threadId);
    setSidebarTitleDraft(title);
    setEditingTitle(false);
  }

  function startHeaderRename() {
    if (!activeId) {
      return;
    }
    setTitleDraft(activeThread?.title ?? "");
    setEditingTitle(true);
    setRenamingThreadId(null);
  }

  function selectThread(threadId: string) {
    if (threadId === activeId) {
      return;
    }
    if (busy) {
      return;
    }
    if (editingMessageId) {
      const keepEditing = confirm("Discard your edit?");
      if (!keepEditing) {
        return;
      }
    }
    setRenamingThreadId(null);
    setEditingTitle(false);
    stickToBottomRef.current = true;
    setShowJumpDown(false);
    setActiveId(threadId);
  }

  async function handleModelChange(modelId: string) {
    if (!activeId) {
      setDefaultModelId(modelId);
      return;
    }
    setError(null);
    try {
      await updateThreadModel(activeId, modelId);
      setThreads((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, modelId } : t)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleEditMessage(messageId: string) {
    if (!activeId || busy || !chatReady) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await editMessage(activeId, messageId, editDraft);
      setEditingMessageId(null);
      setEditDraft("");
      setMessages(result.messages);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                title: result.threadTitle,
                messageCount: result.messages.length,
              }
            : t,
        ),
      );
      if (result.providerError) {
        setError(result.providerError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (activeId) {
        const synced = await listMessages(activeId);
        setMessages(synced);
        if (!synced.some((m) => m.id === messageId)) {
          setEditingMessageId(messageId);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAttach(file: File) {
    if (!session?.workspacePolicy?.allowAttachments) {
      setError("Attachments are disabled for this organization.");
      return;
    }
    setUploadBusy(true);
    setError(null);
    try {
      const att = await uploadAttachment(file);
      setPendingFiles((prev) => [...prev, att]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleSend() {
    if (busy || !chatReady) {
      return;
    }
    if (!draft.trim() && pendingFiles.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    const content = draft;
    setDraft("");
    let threadId = activeId;
    try {
      if (!threadId) {
        const modelId = defaultModelId || models[0]?.id;
        if (!modelId) {
          throw new Error("No model available.");
        }
        const created = await createThread(modelId);
        threadId = created.id;
        setThreads((prev) => [created, ...prev]);
        setActiveId(created.id);
        setMessages([]);
      }
    } catch (e) {
      setDraft(content);
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      redactionCount: 0,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const result = await sendMessage(
        threadId,
        content,
        pendingFiles.map((f) => f.id),
      );
      setPendingFiles([]);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        ...result.messages,
      ]);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                title: result.threadTitle,
                messageCount: result.messages.length,
              }
            : t,
        ),
      );
      if (result.providerError) {
        setError(result.providerError);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (threadId) {
        const [synced, threadList] = await Promise.all([
          listMessages(threadId),
          listThreads(),
        ]);
        setMessages(synced);
        setThreads(threadList);
      }
      setDraft(content);
    } finally {
      setBusy(false);
    }
  }

  const modelValue = activeThread?.modelId ?? defaultModelId;
  const activeModelMeta = models.find((m) => m.id === modelValue);
  const hintModelName = activeModelMeta?.label ?? null;

  useEffect(() => {
    if (!activeId || !chatReady || models.length === 0) {
      return;
    }
    const allowed = models.some((m) => m.id === modelValue);
    const fallback = defaultModelId || models[0]?.id;
    if (!allowed && fallback && fallback !== modelValue) {
      void updateThreadModel(activeId, fallback).then(() => {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeId ? { ...t, modelId: fallback } : t,
          ),
        );
      });
    }
  }, [activeId, chatReady, models, modelValue, defaultModelId]);
  const dlp = session?.workspaceDlp;

  function renderSetupBanner() {
    if (chatReady) {
      return null;
    }
    if (setupPhase !== "need_policy" && setupPhase !== "need_provider") {
      return null;
    }
    if (!isAdmin) {
      return (
        <div className={styles.setupBanner} role="status">
          Chat isn&apos;t set up yet. Contact your administrator.
        </div>
      );
    }
    return (
      <div className={styles.setupBanner} role="status">
        {setupPhase === "need_policy" ? (
          <>
            Choose which AI models to offer in{" "}
            <Link href="/admin/models">Policy</Link>.
          </>
        ) : (
          <>
            Connect an AI provider in{" "}
            <Link href="/admin/providers">Providers</Link>.
          </>
        )}
      </div>
    );
  }

  const userInitial = (
    session?.user.displayName ??
    session?.user.email ??
    "?"
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div
      className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ""}`}
    >
      <aside
        className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
        aria-label="Workspace navigation"
      >
        {sidebarCollapsed ? (
          <>
            <button
              type="button"
              className={styles.railBtn}
              onClick={toggleSidebar}
              title="Expand sidebar (Ctrl+L)"
              aria-label="Expand sidebar"
              aria-expanded={false}
            >
              <PanelLeft size={18} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.railBtn}
              disabled={!chatReady}
              onClick={() => void handleNewChat()}
              title="New chat"
              aria-label="New chat"
            >
              <Plus size={18} aria-hidden />
            </button>
            <div className={styles.railSpacer} />
            <Link
              href="/account"
              className={styles.railAvatar}
              title={session?.user.displayName ?? session?.user.email ?? "Account"}
            >
              {userInitial}
            </Link>
          </>
        ) : (
          <>
            <div className={styles.brandRow}>
              <div>
                <span className={styles.logo}>Workspace</span>
                <span className={styles.tag}>
                  {session?.tenant.name ?? "…"}
                </span>
              </div>
              <button
                type="button"
                className={styles.sidebarToggle}
                onClick={toggleSidebar}
                title="Collapse sidebar (Ctrl+L)"
                aria-label="Collapse sidebar"
                aria-expanded={true}
              >
                <PanelLeftClose size={17} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              className={styles.newChatBtn}
              disabled={!chatReady}
              onClick={() => void handleNewChat()}
            >
              <Plus size={16} aria-hidden />
              New chat
            </button>
            <p className={styles.threadSectionLabel}>Chats</p>
            <ul className={styles.threadList}>
              {threads.length === 0 ? (
                <li className={styles.threadEmpty}>No chats yet</li>
              ) : null}
              {threads.map((t) => (
                <li
                  key={t.id}
                  aria-current={t.id === activeId ? "page" : undefined}
                  className={
                    t.id === activeId ? styles.threadRowActive : styles.threadRow
                  }
                >
                  {renamingThreadId === t.id ? (
                    <input
                      className={styles.threadRenameInput}
                      value={sidebarTitleDraft}
                      autoFocus
                      maxLength={120}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSidebarTitleDraft(e.target.value)}
                      onBlur={() => void commitTitleRename(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitTitleRename(t.id);
                        }
                        if (e.key === "Escape") {
                          setRenamingThreadId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.threadItem}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        startSidebarRename(t.id, t.title);
                      }}
                      onClick={() => selectThread(t.id)}
                    >
                      <span className={styles.threadTitleText}>{t.title}</span>
                    </button>
                  )}
                  {renamingThreadId === t.id ? null : (
                    <ThreadRowMenu
                      onRename={() => startSidebarRename(t.id, t.title)}
                      onDelete={() => void handleDeleteThread(t.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
            <div className={styles.sidebarFooter}>
              <div className={styles.userBlock}>
                <span className={styles.userAvatar} aria-hidden>
                  {userInitial}
                </span>
                <div className={styles.userMeta}>
                  <p className={styles.userName}>
                    {session?.user.displayName ?? session?.user.email ?? "…"}
                  </p>
                  <div className={styles.footerLinks}>
                    <Link href="/account" className={styles.footerLink}>
                      Account
                    </Link>
                    {isAdmin ? (
                      <Link href="/admin" className={styles.footerLink}>
                        Admin
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className={styles.iconFooterBtn}
                      onClick={() => {
                        const pref = cycleThemePreference();
                        setThemePreference(pref);
                        setTheme(resolveTheme());
                      }}
                    >
                      {themePreference === "system" ? (
                        <Monitor size={13} aria-hidden />
                      ) : theme === "dark" ? (
                        <Moon size={13} aria-hidden />
                      ) : (
                        <Sun size={13} aria-hidden />
                      )}
                      {themePreferenceLabel(themePreference)}
                    </button>
                    <button
                      type="button"
                      className={styles.iconFooterBtn}
                      onClick={() => {
                        void idApi("/auth/logout", { method: "POST" }).finally(
                          () => {
                            router.replace("/login");
                          },
                        );
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      <main className={styles.main}>
        {renderSetupBanner()}

        {!activeId ? (
          <div className={styles.chatStage}>
            <div className={styles.welcome}>
              <h1>How can I help?</h1>
              <p>
                Ask anything. Sensitive details stay private before they leave
                your organization.
              </p>
              {dlp ? (
                <div className={styles.welcomeActions}>
                  <button
                    type="button"
                    className={styles.dlpChip}
                    onClick={() => setDlpOpen(true)}
                  >
                    <Shield size={14} aria-hidden />
                    What stays private
                  </button>
                </div>
              ) : null}
            </div>
            <div className={`${styles.composerDock} ${styles.welcomeComposer}`}>
              {error ? (
                <div className={styles.errorPanel} role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    className={styles.errorDismiss}
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
              <div
                className={`${styles.composerCard} ${!chatReady ? styles.composerCardDisabled : ""}`}
              >
                <div className={styles.composerInputRow}>
                  <textarea
                    ref={textareaRef}
                    className={styles.composerInput}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      chatReady
                        ? "How can I help you today?"
                        : "Chat isn't available yet"
                    }
                    rows={1}
                    disabled={busy || !chatReady}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                </div>
                <div className={styles.composerToolbar}>
                  <div className={styles.composerActions}>
                    <label className={styles.toolBtn} title="Attach file">
                      <input
                        type="file"
                        hidden
                        disabled={
                          uploadBusy ||
                          !session?.workspacePolicy?.allowAttachments ||
                          !chatReady
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleAttach(file);
                          e.target.value = "";
                        }}
                      />
                      <Plus size={18} aria-hidden />
                    </label>
                  </div>
                  <div className={styles.composerTrailing}>
                    <ModelPicker
                      models={models}
                      value={modelValue}
                      disabled={!chatReady}
                      onChange={(id) => void handleModelChange(id)}
                    />
                    <button
                      type="button"
                      className={styles.sendRound}
                      disabled={
                        busy ||
                        !chatReady ||
                        (!draft.trim() && pendingFiles.length === 0)
                      }
                      title="Send"
                      onClick={() => void handleSend()}
                    >
                      <ArrowUp size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
              <p className={styles.composerHint}>
                {hintModelName ? `${hintModelName} · ` : ""}
                Sensitive values stay private before the model sees your message.
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.chatStage}>
            <header className={styles.mainHeader}>
              <div className={styles.mainHeaderStart}>
                {editingTitle ? (
                  <input
                    className={styles.titleInput}
                    value={titleDraft}
                    autoFocus
                    maxLength={120}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void commitTitleRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitTitleRename();
                      }
                      if (e.key === "Escape") {
                        setEditingTitle(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.titleRenameRow}
                    title="Rename conversation"
                    onClick={() => startHeaderRename()}
                  >
                    <span className={styles.topBarTitle}>
                      {activeThread?.title ?? "Chat"}
                    </span>
                    <Pencil
                      size={13}
                      aria-hidden
                      className={styles.titleRenameIcon}
                    />
                  </button>
                )}
              </div>
              {dlp ? (
                <button
                  type="button"
                  className={styles.topBarPrivacy}
                  onClick={() => setDlpOpen(true)}
                  title={dlp.profileLabel}
                  aria-label="Privacy settings"
                >
                  <Shield size={15} aria-hidden />
                </button>
              ) : null}
            </header>

            <div className={styles.chatInner}>
              <div
                className={styles.messages}
                ref={messagesRef}
                onScroll={onMessagesScroll}
              >
                {messages.length === 0 && !busy ? (
                  <div className={styles.emptyThread}>
                    <p className={styles.hintLine}>
                      {!chatReady
                        ? "Chat isn't available yet."
                        : hintModelName
                          ? `Using ${hintModelName}.`
                          : "Send a message to start."}
                    </p>
                  </div>
                ) : null}
                {editingMessageId &&
                !messages.some((m) => m.id === editingMessageId) ? (
                  <div className={styles.msgUser}>
                    <div className={styles.msgEditPanel}>
                      <textarea
                        className={styles.msgEditInput}
                        value={editDraft}
                        autoFocus
                        rows={6}
                        onChange={(e) => setEditDraft(e.target.value)}
                      />
                      <p className={styles.msgEditHint}>
                        Later messages will be replaced.
                      </p>
                      <div className={styles.msgEditActions}>
                        <button
                          type="button"
                          className={styles.msgEditSecondary}
                          onClick={() => {
                            void (async () => {
                              setEditingMessageId(null);
                              setEditDraft("");
                              if (activeId) {
                                setMessages(await listMessages(activeId));
                              }
                            })();
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.msgEditPrimary}
                          disabled={busy || !editDraft.trim()}
                          onClick={() => void handleEditMessage(editingMessageId)}
                        >
                          Save & regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className={styles.msgUser}>
                      {editingMessageId === m.id ? (
                        <div className={styles.msgEditPanel}>
                          <textarea
                            className={styles.msgEditInput}
                            value={editDraft}
                            autoFocus
                            rows={6}
                            onChange={(e) => setEditDraft(e.target.value)}
                          />
                          <p className={styles.msgEditHint}>
                            Later messages will be replaced.
                          </p>
                          <div className={styles.msgEditActions}>
                            <button
                              type="button"
                              className={styles.msgEditSecondary}
                              onClick={() => {
                                void (async () => {
                                  setEditingMessageId(null);
                                  setEditDraft("");
                                  if (activeId) {
                                    setMessages(await listMessages(activeId));
                                  }
                                })();
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.msgEditPrimary}
                              disabled={busy || !editDraft.trim()}
                              onClick={() => void handleEditMessage(m.id)}
                            >
                              Save & regenerate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.msgUserBubbleWrap}>
                          {m.attachments && m.attachments.length > 0 ? (
                            <div className={styles.msgAttachments}>
                              {m.attachments.map((a) => (
                                <AttachmentProtectedChip
                                  key={a.id}
                                  attachment={a}
                                  providerLabel={
                                    hintModelName ?? "the model provider"
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                          {m.content ? (
                            <div className={styles.msgUserInner}>{m.content}</div>
                          ) : null}
                          <UserPrivacyStrip
                            redactionCount={m.redactionCount}
                            manifest={m.redactionManifest}
                            upstream={m.contentUpstream}
                            providerLabel={hintModelName ?? "the model provider"}
                          />
                          <button
                            type="button"
                            className={styles.msgEditBtn}
                            title="Edit message"
                            onClick={() => {
                              setEditingMessageId(m.id);
                              setEditDraft(m.content);
                            }}
                          >
                            <PenLine size={14} aria-hidden />
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={m.id} className={styles.msgAssistant}>
                      <div className={styles.assistantBody}>
                        {m.content}
                        <AssistantActions
                          content={m.content}
                          upstream={m.contentUpstream}
                          restoredCount={m.restoredCount}
                        />
                      </div>
                    </div>
                  ),
                )}
                {busy ? (
                  <div className={styles.msgAssistant}>
                    <div className={`${styles.assistantBody} ${styles.typing}`}>
                      Thinking…
                    </div>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className={styles.composerDock}>
              {showJumpDown ? (
                <button
                  type="button"
                  className={styles.jumpDown}
                  onClick={jumpToBottom}
                  title="Jump to latest"
                  aria-label="Jump to latest"
                >
                  <ArrowDown size={16} aria-hidden />
                </button>
              ) : null}
              {error ? (
                <div className={styles.errorPanel} role="alert">
                  <p>{error}</p>
                  <button
                    type="button"
                    className={styles.errorDismiss}
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
              <div
                className={`${styles.composerCard} ${!chatReady ? styles.composerCardDisabled : ""}`}
              >
                {pendingFiles.length > 0 ? (
                  <div className={styles.attachList}>
                    {pendingFiles.map((f) => (
                      <AttachmentProtectedChip
                        key={f.id}
                        attachment={f}
                        providerLabel={hintModelName ?? "the model provider"}
                        compact
                      />
                    ))}
                  </div>
                ) : null}
                <div className={styles.composerInputRow}>
                  <textarea
                    ref={textareaRef}
                    className={styles.composerInput}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      chatReady
                        ? "Ask a follow-up…"
                        : "Chat isn't available yet"
                    }
                    rows={1}
                    disabled={busy || !chatReady}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                </div>
                <div className={styles.composerToolbar}>
                  <div className={styles.composerActions}>
                    <label className={styles.toolBtn} title="Attach file">
                      <input
                        type="file"
                        hidden
                        disabled={
                          uploadBusy ||
                          !session?.workspacePolicy?.allowAttachments ||
                          !chatReady
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleAttach(file);
                          }
                          e.target.value = "";
                        }}
                      />
                      <Plus size={18} aria-hidden />
                    </label>
                  </div>
                  <div className={styles.composerTrailing}>
                    <ModelPicker
                      models={models}
                      value={modelValue}
                      disabled={!chatReady}
                      onChange={(id) => void handleModelChange(id)}
                    />
                    <button
                      type="button"
                      className={styles.sendRound}
                      disabled={
                        busy ||
                        !chatReady ||
                        (!draft.trim() && pendingFiles.length === 0)
                      }
                      title="Send"
                      onClick={() => void handleSend()}
                    >
                      <ArrowUp size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
              <p className={styles.composerHint}>
                {hintModelName ? `${hintModelName}` : ""}
                {hintModelName && session?.workspacePolicy?.allowAttachments
                  ? " · "
                  : ""}
                {session?.workspacePolicy?.allowAttachments
                  ? `Files up to ${session.workspacePolicy.maxFileMb} MB`
                  : hintModelName
                    ? ""
                    : "Workspace can make mistakes. Check important details."}
              </p>
            </div>
          </div>
        )}
      </main>

      {dlp ? (
        <WorkspaceDlpPanel
          open={dlpOpen}
          onClose={() => setDlpOpen(false)}
          dlp={dlp}
        />
      ) : null}
    </div>
  );
}
