'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePresence } from '@/hooks/usePresence';
import type { Task, Profile, Comment, Subtask, ActivityLogEntry, Attachment } from '@/lib/database.types';
import { STATUS_META, PRIORITY_META, formatDate, formatDateTime, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';

const EMOJI = ['👍', '🎉', '✅', '🔥', '❤️', '😄'];

export default function TaskPanel({ taskId, profiles, onClose }: { taskId: string; profiles: Profile[]; onClose: () => void }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();

  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newCommentFile, setNewCommentFile] = useState<File | null>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { others, track } = usePresence(
    `task-presence-${taskId}`,
    me ? { user_id: me.id, name: fullName(me) || 'Коллега', avatar_url: me.avatar_url } : null
  );

  useEffect(() => { if (me) track({ editing: true, typing: false }); }, [me?.id, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const editingOthers = others.filter((o) => o.editing);
  const typingOthers = others.filter((o) => o.typing);

  useEffect(() => {
    let active = true;
    async function load() {
      const [t, c, s, a, att] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', taskId).single(),
        supabase.from('comments').select('*').eq('task_id', taskId).order('created_at'),
        supabase.from('subtasks').select('*').eq('task_id', taskId).order('position'),
        supabase.from('activity_log').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('task_id', taskId).order('created_at'),
      ]);
      if (!active) return;
      setTask(t.data as Task);
      setComments((c.data as Comment[]) ?? []);
      setSubtasks((s.data as Subtask[]) ?? []);
      setActivity((a.data as ActivityLogEntry[]) ?? []);
      setAttachments((att.data as Attachment[]) ?? []);
    }
    load();

    const channel = supabase
      .channel(`task-detail-${taskId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}` }, (p) => setTask(p.new as Task))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `task_id=eq.${taskId}` },
        (p) => setComments((prev) => (prev.some((x) => x.id === (p.new as Comment).id) ? prev : [...prev, p.new as Comment])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks', filter: `task_id=eq.${taskId}` }, (p) => refreshList(p, setSubtasks))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `task_id=eq.${taskId}` },
        (p) => setActivity((prev) => [p.new as ActivityLogEntry, ...prev]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attachments', filter: `task_id=eq.${taskId}` },
        (p) => setAttachments((prev) => [...prev, p.new as Attachment]))
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshList<T extends { id: string }>(payload: any, setter: React.Dispatch<React.SetStateAction<T[]>>) {
    setter((prev) => {
      if (payload.eventType === 'INSERT') return prev.some((x) => x.id === payload.new.id) ? prev : [...prev, payload.new as T];
      if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === payload.new.id ? (payload.new as T) : x));
      if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== payload.old.id);
      return prev;
    });
  }

  async function updateField(patch: Partial<Task>) {
    if (!task) return;
    setTask({ ...task, ...patch });
    await supabase.from('tasks').update(patch).eq('id', task.id);
  }

  async function sendComment() {
    if ((!newComment.trim() && !newCommentFile) || !me || !task) return;
    const mentioned = profiles.filter((p) => p.first_name && newComment.includes('@' + p.first_name)).map((p) => p.id);
    const { data: comment, error } = await supabase
      .from('comments')
      .insert({ task_id: task.id, author_id: me.id, text: newComment.trim() || '📎 вложение', mentioned_user_ids: mentioned })
      .select().single();
    if (!error && comment && newCommentFile) {
      const path = `${task.id}/${Date.now()}-${newCommentFile.name}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, newCommentFile);
      if (!upErr) {
        await supabase.from('attachments').insert({
          task_id: task.id, comment_id: comment.id, uploaded_by: me.id, file_name: newCommentFile.name,
          file_type: newCommentFile.name.split('.').pop(), file_size_bytes: newCommentFile.size, storage_path: path,
        });
      }
    }
    setNewComment(''); setNewCommentFile(null);
    track({ typing: false });
  }

  function onCommentChange(v: string) {
    setNewComment(v);
    track({ typing: v.length > 0 });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => track({ typing: false }), 2500);
  }

  async function addSubtask() {
    if (!newSubtask.trim() || !task) return;
    await supabase.from('subtasks').insert({ task_id: task.id, title: newSubtask.trim(), position: subtasks.length });
    setNewSubtask('');
  }
  async function toggleSubtask(item: Subtask) {
    await supabase.from('subtasks').update({ is_done: !item.is_done }).eq('id', item.id);
  }

  async function downloadFile(att: Attachment) {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(att.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  function close() { track({ editing: false, typing: false }); onClose(); }

  if (!task) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={close}>
        <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[94vw] bg-surface p-6" onClick={(e) => e.stopPropagation()}>Загрузка…</div>
      </div>
    );
  }

  const assignee = profiles.find((p) => p.id === task.assignee_id);
  const reporter = profiles.find((p) => p.id === task.reporter_id);
  const taskAttachments = attachments.filter((a) => !a.comment_id);
  const attachmentsByComment = (commentId: string) => attachments.filter((a) => a.comment_id === commentId);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" onClick={close}>
      <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[94vw] bg-surface shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-3.5 border-b border-border flex items-center gap-2">
          <span className="text-xs text-muted font-mono">{task.code}</span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: PRIORITY_META[task.priority].color + '22', color: PRIORITY_META[task.priority].color }}>
            {PRIORITY_META[task.priority].label}
          </span>
<select value={task.status} onChange={(e) => updateField({ status: e.target.value as Task['status'] })} className="text-xs border border-border rounded-md px-2 py-1 bg-surface2">
            {Object.entries(STATUS_META).filter(([id]) => id !== 'approved').map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
          {task.status !== 'done' && task.status !== 'approved' && (me?.id === task.assignee_id || me?.role === 'manager' || me?.role === 'administrator') && (
            <button onClick={() => updateField({ status: 'done' })} className="text-xs font-semibold bg-green text-white rounded-md px-2.5 py-1.5">
              ✓ Выполнено
            </button>
          )}
          {task.status === 'done' && (me?.role === 'manager' || me?.role === 'administrator') && (
            <button onClick={() => updateField({ status: 'approved' })} className="text-xs font-semibold bg-green text-white rounded-md px-2.5 py-1.5">
              ✓ Согласовано
            </button>
          )}
          <button onClick={close} className="ml-auto text-muted hover:text-text w-8 h-8">✕</button>
        </div>

        {(editingOthers.length > 0 || typingOthers.length > 0) && (
          <div className="px-3.5 pt-2 space-y-1">
            {editingOthers.map((o) => (
              <div key={o.user_id} className="text-[11.5px] text-accent font-medium flex items-center gap-1.5"><span className="presence-dot" /> {o.name} сейчас редактирует эту задачу</div>
            ))}
            {typingOthers.map((o) => (
              <div key={o.user_id} className="text-[11.5px] text-purple font-medium">{o.name} печатает комментарий…</div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <input
            defaultValue={task.title}
            onBlur={(e) => e.target.value !== task.title && updateField({ title: e.target.value })}
            className="w-full text-lg font-extrabold outline-none bg-transparent mb-1"
          />
          <div className="text-xs text-muted mb-3">Создано {formatDate(task.created_at)}</div>

          <label className="block text-[11px] text-muted font-semibold uppercase mb-1">Описание</label>
          <textarea
            defaultValue={task.description}
            onBlur={(e) => e.target.value !== task.description && updateField({ description: e.target.value })}
            className="w-full border border-border bg-surface2 rounded-lg p-2.5 text-[13px] min-h-[70px]"
          />

          <div className="grid grid-cols-2 gap-3 my-4">
            <Field label="Исполнитель">
              <select value={task.assignee_id ?? ''} onChange={(e) => updateField({ assignee_id: e.target.value || null })} className="w-full border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]">
                <option value="">Не назначен</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{fullName(p) || p.email}</option>)}
              </select>
            </Field>
            <Field label="Постановщик">
              <div className="flex items-center gap-1.5 text-[13px]"><Avatar profile={reporter} size={20} /> {reporter ? fullName(reporter) : '—'}</div>
            </Field>
            <Field label="Приоритет">
              <select value={task.priority} onChange={(e) => updateField({ priority: e.target.value as Task['priority'] })} className="w-full border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]">
                {Object.entries(PRIORITY_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Дедлайн">
              <input
                type="date"
                value={task.due_date ? task.due_date.slice(0, 10) : ''}
                onChange={(e) => updateField({ due_date: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null })}
                className="w-full border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]"
              />
            </Field>
          </div>

          <SectionTitle>Подзадачи <span className="text-muted font-normal">{subtasks.filter((s) => s.is_done).length}/{subtasks.length}</span></SectionTitle>
          {subtasks.map((s) => (
            <label key={s.id} className="flex items-center gap-2 py-1.5 border-b border-border text-[13px]">
              <input type="checkbox" checked={s.is_done} onChange={() => toggleSubtask(s)} />
              <span className={s.is_done ? 'line-through text-muted' : ''}>{s.title}</span>
            </label>
          ))}
          <div className="flex gap-2 mt-2">
            <input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSubtask()} placeholder="Добавить подзадачу…" className="flex-1 border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]" />
            <button onClick={addSubtask} className="px-2.5 border border-border rounded-md text-sm">+</button>
          </div>

          <SectionTitle>Файлы <span className="text-muted font-normal">{taskAttachments.length}</span></SectionTitle>
          {taskAttachments.map((a) => <AttachmentRow key={a.id} att={a} onDownload={() => downloadFile(a)} />)}
          {taskAttachments.length === 0 && <div className="text-muted text-xs mb-2">Файлы прикрепляются через комментарии ниже</div>}

          <SectionTitle>Комментарии <span className="text-muted font-normal">{comments.length}</span></SectionTitle>
          {comments.map((c) => {
            const author = profiles.find((p) => p.id === c.author_id);
            const files = attachmentsByComment(c.id);
            return (
              <div key={c.id} className="flex gap-2.5 mb-3.5">
                <Avatar profile={author} size={28} />
                <div className="flex-1 bg-surface2 rounded-tr-lg rounded-b-lg rounded-tl-none px-2.5 py-2 text-[13px]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-[12.5px]">{author ? fullName(author) : 'Пользователь'}</span>
                    <span className="text-[11px] text-muted">{formatDateTime(c.created_at)}</span>
                  </div>
                  {renderCommentText(c.text)}
                  {files.map((f) => <AttachmentRow key={f.id} att={f} onDownload={() => downloadFile(f)} compact />)}
                </div>
              </div>
            );
          })}

          <div className="border border-border rounded-lg p-2 bg-surface2">
            {newCommentFile && (
              <div className="flex items-center gap-2 text-xs bg-surface rounded-md px-2 py-1 mb-2 border border-border">
                📎 {newCommentFile.name} <button onClick={() => setNewCommentFile(null)} className="ml-auto text-muted">✕</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <Avatar profile={me} size={26} />
              <textarea
                value={newComment}
                onChange={(e) => onCommentChange(e.target.value)}
                onBlur={() => track({ typing: false })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                placeholder="Написать комментарий... @упомянуть"
                rows={1}
                className="flex-1 bg-transparent outline-none resize-none text-[13px]"
              />
            </div>
            <div className="flex items-center gap-1 mt-1.5 relative">
              <label className="text-sm cursor-pointer px-1.5" title="Прикрепить файл или изображение">
                📎<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setNewCommentFile(e.target.files[0])} />
              </label>
              <button onClick={() => setShowEmoji((v) => !v)} className="text-sm px-1.5" title="Эмодзи">🙂</button>
              {showEmoji && (
                <div className="absolute bottom-7 left-0 bg-surface border border-border rounded-lg shadow-lg p-1.5 flex gap-1 z-10">
                  {EMOJI.map((e) => <button key={e} onClick={() => { setNewComment((v) => v + e); setShowEmoji(false); }} className="text-base hover:scale-125 transition-transform">{e}</button>)}
                </div>
              )}
              <button onClick={sendComment} className="ml-auto text-xs font-semibold bg-accent text-white rounded-md px-2.5 py-1.5">Отправить</button>
            </div>
          </div>

          <SectionTitle>История изменений</SectionTitle>
          {activity.map((h) => (
            <div key={h.id} className="flex gap-2 text-[12.5px] text-text2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted mt-1.5 flex-none" />
              <span>{describeActivity(h, profiles)} · {formatDateTime(h.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderCommentText(text: string) {
  const parts = text.split(/(@[А-Яа-яЁёA-Za-z]+)/g);
  return parts.map((p, i) => (p.startsWith('@') ? <span key={i} className="text-accent font-semibold">{p}</span> : <span key={i}>{p}</span>));
}

function AttachmentRow({ att, onDownload, compact }: { att: Attachment; onDownload: () => void; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 border border-border rounded-lg p-2 ${compact ? 'mt-2 bg-surface' : 'mb-1.5'}`}>
      <div className="w-8 h-8 rounded-md bg-accent text-white flex items-center justify-center text-[10px] font-bold flex-none">{att.file_type?.slice(0, 3).toUpperCase()}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{att.file_name}</div>
        <div className="text-[11px] text-muted">{(att.file_size_bytes / 1024 / 1024).toFixed(1)} МБ</div>
      </div>
      <button onClick={onDownload} className="text-muted hover:text-accent text-xs">⬇</button>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted font-semibold uppercase mb-1">{label}</div>
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[12.5px] font-bold mt-5 mb-2.5">{children}</div>;
}
function describeActivity(h: ActivityLogEntry, profiles: Profile[]): string {
  const actor = profiles.find((p) => p.id === h.actor_id);
  const actorName = actor ? fullName(actor) : 'Кто-то';
  if (h.action === 'created') return `${actorName} создал(а) задачу`;
  if (h.action === 'status_changed') return `${actorName} изменил(а) статус: ${STATUS_META[h.payload.from as string]?.label} → ${STATUS_META[h.payload.to as string]?.label}`;
  if (h.action === 'assigned') return `${actorName} назначил(а) исполнителя`;
  if (h.action === 'commented') return `${actorName} оставил(а) комментарий`;
  return `${actorName}: ${h.action}`;
}
