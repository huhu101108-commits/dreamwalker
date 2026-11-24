using System.Runtime.CompilerServices;

// The editor tools and the Unity tests use the runtime's internal screen and world members.
[assembly: InternalsVisibleTo("Dreamwalker.Editor")]
[assembly: InternalsVisibleTo("Dreamwalker.Tests.Editor")]
[assembly: InternalsVisibleTo("Dreamwalker.Tests.Play")]
