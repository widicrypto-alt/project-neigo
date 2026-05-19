'use client';
import { useState } from 'react';
import { ChevronUp, ChevronDown, CornerDownRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { RichContent } from '../ui/RichContent';

export interface CommentData {
  id: string;
  parentId: string | null;
  authorId: string;
  bodyMd: string;
  bodyHtml: string;
  upvotes: number;
  downvotes: number;
  pinnedByOwner: boolean;
  deletedAt: string | null;
  createdAt: string;
  author?: { id: string; handle: string; displayName: string; avatarUrl: string | null } | null;
}

interface Props {
  entityType: 'character' | 'story';
  entityId: string;
  comments: CommentData[];
  currentUserId?: string;
  onRefresh?: () => void;
}

export function CommentThread({ entityType, entityId, comments, currentUserId, onRefresh }: Props) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roots = comments.filter((c) => !c.parentId);
  const childrenOf = (id: string) => comments.filter((c) => c.parentId === id);

  async function submit(parentId: string | null) {
    if (!body.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await api.post(`/api/${entityType}s/${entityId}/comments`, {
        bodyMd: body.trim(),
        parentId: parentId ?? undefined,
      });
      setBody('');
      setReplyTo(null);
      onRefresh?.();
    } catch {
      setErr('Gagal mengirim komentar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function softDelete(commentId: string) {
    try {
      await api.del(`/api/${entityType}s/${entityId}/comments/${commentId}`);
      onRefresh?.();
    } catch {
      setErr('Gagal menghapus komentar.');
    }
  }

  function CommentCard({ comment, depth = 0 }: { comment: CommentData; depth?: number }) {
    const deleted = !!comment.deletedAt;
    return (
      <div className={cn('flex flex-col gap-2', depth > 0 && 'ml-6 border-l border-ink-800 pl-3')}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span className="font-medium text-ink-300">
              {comment.author?.displayName ?? comment.author?.handle ?? 'Anonim'}
            </span>
            {comment.pinnedByOwner && (
              <span className="rounded bg-violet-900 px-1.5 py-0.5 text-violet-300 text-[10px]">📌 Disematkan</span>
            )}
            <span>{new Date(comment.createdAt).toLocaleDateString('id-ID')}</span>
          </div>

          {deleted ? (
            <p className="text-ink-600 italic text-sm">[dihapus]</p>
          ) : (
            <RichContent html={comment.bodyHtml} className="text-sm" />
          )}

          {!deleted && (
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="text-xs text-ink-500 hover:text-violet-400 transition-colors flex items-center gap-1"
              >
                <CornerDownRight size={12} />
                Balas
              </button>
              {currentUserId && (currentUserId === comment.authorId) && (
                <button
                  onClick={() => softDelete(comment.id)}
                  className="text-xs text-ink-600 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Hapus
                </button>
              )}
              <span className="text-xs text-ink-600">
                <ChevronUp size={12} className="inline" /> {comment.upvotes}
              </span>
            </div>
          )}
        </div>

        {replyTo === comment.id && (
          <CommentInput parentId={comment.id} />
        )}

        {childrenOf(comment.id).map((child) => (
          <CommentCard key={child.id} comment={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  function CommentInput({ parentId }: { parentId: string | null }) {
    return (
      <div className="flex flex-col gap-2 mt-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={parentId ? 'Tulis balasan…' : 'Tulis komentar…'}
          rows={3}
          className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-ink-200 placeholder-ink-600 resize-none focus:outline-none focus:border-violet-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => submit(parentId)}
            disabled={submitting || !body.trim()}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-1.5 text-sm text-white disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Mengirim…' : 'Kirim'}
          </button>
          {parentId && (
            <button
              onClick={() => setReplyTo(null)}
              className="text-sm text-ink-500 hover:text-ink-300 transition-colors"
            >
              Batal
            </button>
          )}
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {currentUserId && replyTo === null && (
        <CommentInput parentId={null} />
      )}
      {err && !submitting && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-5">
        {roots.length === 0 && (
          <p className="text-sm text-ink-500 italic">Belum ada komentar. Jadilah yang pertama!</p>
        )}
        {roots.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  );
}
