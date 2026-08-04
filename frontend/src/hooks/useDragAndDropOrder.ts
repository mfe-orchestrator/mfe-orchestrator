import { useCallback, useState } from "react"

export const moveItem = <T>(items: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return items
    }
    const newItems = [...items]
    const [moved] = newItems.splice(from, 1)
    newItems.splice(to, 0, moved)
    return newItems
}

interface UseDragAndDropOrderProps<T> {
    items: T[]
    /** Identifier of an item, used to match the dragged element. Items without an id can fall back on their index */
    getId: (item: T, index: number) => string
    /** Called with the reordered list every time the user drops an item or moves it with the keyboard */
    onReorder: (items: T[]) => void
    disabled?: boolean
}

/**
 * Native HTML5 drag and drop ordering, with a keyboard accessible handle.
 * The item is draggable only while the handle is pressed, so text selection
 * and buttons inside the item keep working as usual.
 */
const useDragAndDropOrder = <T>({ items, getId, onReorder, disabled }: UseDragAndDropOrderProps<T>) => {
    const [handleActiveId, setHandleActiveId] = useState<string>()
    const [draggingId, setDraggingId] = useState<string>()
    const [dragOverId, setDragOverId] = useState<string>()

    const indexOf = useCallback((id: string) => items.findIndex((item, index) => getId(item, index) === id), [items, getId])

    const reset = useCallback(() => {
        setHandleActiveId(undefined)
        setDraggingId(undefined)
        setDragOverId(undefined)
    }, [])

    const move = useCallback(
        (fromId: string, toId: string) => {
            const from = indexOf(fromId)
            const to = indexOf(toId)
            if (from === -1 || to === -1 || from === to) return
            onReorder(moveItem(items, from, to))
        },
        [indexOf, items, onReorder]
    )

    const moveBy = useCallback(
        (id: string, delta: number) => {
            const from = indexOf(id)
            const to = from + delta
            if (from === -1 || to < 0 || to >= items.length) return
            onReorder(moveItem(items, from, to))
        },
        [indexOf, items, onReorder]
    )

    const getHandleProps = (id: string) => ({
        onPointerDown: () => setHandleActiveId(id),
        onPointerUp: () => setHandleActiveId(undefined),
        onKeyDown: (event: React.KeyboardEvent) => {
            if (disabled) return
            if (event.key === "ArrowUp") {
                event.preventDefault()
                moveBy(id, -1)
            } else if (event.key === "ArrowDown") {
                event.preventDefault()
                moveBy(id, 1)
            }
        }
    })

    const getItemProps = (id: string) => ({
        draggable: !disabled && handleActiveId === id,
        onDragStart: (event: React.DragEvent) => {
            setDraggingId(id)
            event.dataTransfer.effectAllowed = "move"
            // Firefox needs some data to actually start the drag
            event.dataTransfer.setData("text/plain", id)
        },
        onDragOver: (event: React.DragEvent) => {
            if (!draggingId || draggingId === id) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            setDragOverId(id)
        },
        onDragLeave: () => {
            setDragOverId(current => (current === id ? undefined : current))
        },
        onDrop: (event: React.DragEvent) => {
            event.preventDefault()
            if (draggingId && draggingId !== id) {
                move(draggingId, id)
            }
            reset()
        },
        onDragEnd: reset
    })

    return {
        draggingId,
        dragOverId,
        getHandleProps,
        getItemProps,
        moveBy
    }
}

export default useDragAndDropOrder
