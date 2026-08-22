import { useState, useCallback, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import KPICard from './KPICard';

// Individual sortable card — invisible while dragging (overlay takes its place)
function SortableKPICard({ card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.25,1,0.5,1)',
        opacity: isDragging ? 0 : 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <KPICard {...card} />
    </div>
  );
}

/**
 * SortableKPIGrid — drop-in replacement for a static kpi-grid.
 *
 * Props:
 *   cards      — array of { id, label, value, icon, accent, sub, small, trend, trendDir }
 *   storageKey — unique string; order is persisted to localStorage under `nia_kpi_${storageKey}`
 *   style      — extra styles for the grid wrapper
 *   cols       — optional minmax column width (default '175px')
 */
export default function SortableKPIGrid({ cards, storageKey, style, cols = '175px' }) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`nia_kpi_${storageKey}`));
      const ids   = cards.map(c => c.id);
      // Only restore if the saved set exactly matches current cards
      if (Array.isArray(saved) && saved.length === ids.length && saved.every(id => ids.includes(id)))
        return saved;
    } catch { /* ignore */ }
    return cards.map(c => c.id);
  });

  // Cards can appear/disappear at runtime (e.g. a card only shown when a filter
  // is active) — the initializer above only runs once at mount, so without this,
  // a card that didn't exist yet at mount time could never show up later, and a
  // card that's since disappeared would stay stuck in the saved order forever.
  // Keeps the user's manually-dragged order for cards that still exist; new
  // cards are appended, stale ones dropped.
  const idsKey = cards.map(c => c.id).join('|');
  useEffect(() => {
    const ids = cards.map(c => c.id);
    setOrder(prevOrder => {
      const stillValid = prevOrder.filter(id => ids.includes(id));
      const newIds = ids.filter(id => !stillValid.includes(id));
      const next = [...stillValid, ...newIds];
      if (next.length === prevOrder.length && next.every((id, i) => id === prevOrder[i])) return prevOrder;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    // Require 6px of movement before drag starts — prevents accidental drags on click
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const sorted     = order.map(id => cards.find(c => c.id === id)).filter(Boolean);
  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;

  const handleDragStart = useCallback(({ active }) => setActiveId(active.id), []);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id));
      try { localStorage.setItem(`nia_kpi_${storageKey}`, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [storageKey]);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div
          className="kpi-grid"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cols}, 1fr))`, ...style }}
        >
          {sorted.map(card => <SortableKPICard key={card.id} card={card} />)}
        </div>
      </SortableContext>

      {/* DragOverlay renders in a portal above everything — GPU-composited, no reflow */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeCard && (
          <div style={{ opacity: 0.92, transform: 'scale(1.06) rotate(1.5deg)', cursor: 'grabbing', pointerEvents: 'none' }}>
            <KPICard {...activeCard} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
