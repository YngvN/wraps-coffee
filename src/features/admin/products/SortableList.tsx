import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { useLanguage } from '../../../i18n'
import './SortableList.scss'

interface SortableListProps<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (nextItems: T[]) => void
  /** Renders one item's own content — this component only owns drag mechanics, the handle, and enter/exit animation. */
  renderItem: (item: T) => ReactNode
}

/**
 * A drag-reorderable vertical list of cards, shared by the admin Products
 * feature's category-reorder (`CategoriesView`) and product-reorder
 * (`ProductListView`) — both are the same "reorder a flat list of cards"
 * shape. Each item fades/slides in and out on add/remove (matching
 * `ProductsView`'s own existing `AnimatePresence` convention) via an *inner*
 * `motion.div`, while dnd-kit's own transform/transition — which drives the
 * "other items slide to open a gap" reordering animation — is applied to the
 * *outer* `<li>` only. This split is deliberate: dnd-kit's `useSortable` and
 * framer-motion's `animate`/`exit` props both want to own the same element's
 * CSS `transform`, and applying both to one node would have them stomp on
 * each other frame-to-frame; keeping them on two different nodes avoids that
 * entirely. The "lifted" pickup look (scale + outward shadow) is rendered via
 * `DragOverlay` — a second, independent, pointer-following clone — for the
 * same reason: it never touches the in-list item's own transform.
 */
export function SortableList<T>({ items, getId, onReorder, renderItem }: SortableListProps<T>) {
  const { t } = useLanguage()
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => getId(item) === active.id)
    const newIndex = items.findIndex((item) => getId(item) === over.id)
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  const activeItem = items.find((item) => getId(item) === activeId)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        <ul className="sortable-list">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <SortableListItem key={getId(item)} id={getId(item)} dragHandleLabel={t('admin.common.dragToReorder')}>
                {renderItem(item)}
              </SortableListItem>
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
      <DragOverlay>{activeItem && <div className="sortable-list__drag-overlay">{renderItem(activeItem)}</div>}</DragOverlay>
    </DndContext>
  )
}

interface SortableListItemProps {
  id: string
  dragHandleLabel: string
  children: ReactNode
}

/**
 * One sortable item: the outer `<li>` owns dnd-kit's own transform/transition
 * (the "other items slide to open a gap" animation — `SortableContext`'s
 * documented default behavior with `verticalListSortingStrategy`, no extra
 * config needed) and fades to near-invisible while dragged, since its own
 * `DragOverlay` clone (see `SortableList` above) is what's actually shown
 * "lifted" following the pointer. The inner `motion.div` owns only the
 * add/remove fade-slide, untouched by dnd-kit. A dedicated drag-handle
 * button (not the whole row) keeps tapping a row to edit/open it unambiguous
 * from dragging it.
 */
function SortableListItem({ id, dragHandleLabel, children }: SortableListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <li ref={setNodeRef} className="sortable-list__item" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <motion.div
        className="sortable-list__item-inner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        <button type="button" className="sortable-list__handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
          ⠿
        </button>
        <div className="sortable-list__content">{children}</div>
      </motion.div>
    </li>
  )
}
