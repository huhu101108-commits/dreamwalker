using UnityEngine;

namespace Dreamwalker.UI
{
    // Runs a screen's drawing for each IMGUI event when the Editor compares against the previous IMGUI screens.
    public sealed class StudioImmediateUi : MonoBehaviour
    {
        public System.Action paint;
        public int depth;
        private void OnGUI()
        {
            GUI.depth = depth;
            paint?.Invoke();
        }
    }
}
