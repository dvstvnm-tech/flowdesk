'use client';
import { useState } from 'react';
import QuickAddModal from '@/components/QuickAddModal';

export default function AddTaskButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold border border-border rounded-lg px-3 py-1.5 text-accent hover:bg-accentSoft">
        + Добавить задачу
      </button>
      {open && (
        <QuickAddModal
          status="review"
          profiles={[]}
          onClose={() => setOpen(false)}
          onCreated={() => setOpen(false)}
        />
      )}
    </>
  );
}
