using UnityEngine;
using UnityEngine.EventSystems;

namespace Dreamwalker.UI
{
    // Pointer state of a uGUI control: held while a press that started on it stays over it, clicked on release.
    public sealed class StudioPress : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerEnterHandler, IPointerExitHandler, IPointerClickHandler
    {
        private bool down, inside;
        public bool Held => down && inside;
        public bool Clicked { get; set; }
        public int PressedFrame { get; private set; } = -1;

        public void OnPointerDown(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Left) return;
            down = true; inside = true; PressedFrame = Time.frameCount;
        }
        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.button == PointerEventData.InputButton.Left) down = false;
        }
        public void OnPointerEnter(PointerEventData eventData) => inside = true;
        public void OnPointerExit(PointerEventData eventData) => inside = false;
        public void OnPointerClick(PointerEventData eventData)
        {
            if (eventData.button == PointerEventData.InputButton.Left) Clicked = true;
        }
        private void OnDisable() { down = false; inside = false; Clicked = false; }
    }
}
