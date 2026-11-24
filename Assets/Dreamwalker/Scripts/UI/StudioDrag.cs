using UnityEngine;
using UnityEngine.EventSystems;

namespace Dreamwalker.UI
{
    // Horizontal position (0..1) of a press dragged across a slider track.
    public sealed class StudioDrag : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler, IInitializePotentialDragHandler
    {
        public bool Dragging { get; private set; }
        public float Normalized { get; private set; }

        private void Track(PointerEventData eventData)
        {
            var rect = (RectTransform)transform;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, eventData.position, eventData.pressEventCamera, out var local)) return;
            var area = rect.rect;
            Normalized = area.width > 0 ? Mathf.Clamp01((local.x - area.xMin) / area.width) : 0;
        }
        public void OnPointerDown(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Left) return;
            Dragging = true; Track(eventData);
        }
        // A slider inside a scroll list should move the knob, not the list.
        public void OnInitializePotentialDrag(PointerEventData eventData) => eventData.useDragThreshold = false;
        public void OnDrag(PointerEventData eventData) { if (Dragging) Track(eventData); }
        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.button == PointerEventData.InputButton.Left) Dragging = false;
        }
        private void OnDisable() => Dragging = false;
    }
}
