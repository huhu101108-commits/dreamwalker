// Unity → page for the web player (StudioWebBridge.cs). The studio's «Unity로 테스트 플레이» frame defines
// window.dreamwalkerUnity (Studio/src/unity-play.js); on any other page the call does nothing.
mergeInto(LibraryManager.library, {
  DreamwalkerWebPost: function (json) {
    var text = UTF8ToString(json);
    if (typeof window.dreamwalkerUnity === 'function') window.dreamwalkerUnity(text);
  },
});
