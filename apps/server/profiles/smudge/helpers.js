// smudge:v7
// Shared by the Smudge parts. Each part loads this file, so a part mixed into another profile
// still works; the guards keep one copy of each helper.
window.profileData = window.profileData || forma.profile.read();
window.profileData.catch(() => {});
window.refreshSocial =
  window.refreshSocial ||
  (async () => {
    try {
      const data = await forma.profile.social.read();
      window.dispatchEvent(new CustomEvent("profile-social", { detail: data }));
      return data;
    } catch {
      return null;
    }
  });
// Covers are fetched once per post and shared by every part that shows them.
window.coverFor =
  window.coverFor ||
  (() => {
    const covers = new Map();
    return (post) => {
      if (!post || !post.hasCover) return Promise.resolve(null);
      if (!covers.has(post.id))
        covers.set(
          post.id,
          forma.profile.cover(post.id).catch(() => null),
        );
      return covers.get(post.id);
    };
  })();
window.openProfilePost =
  window.openProfilePost ||
  ((id, status) =>
    forma.profile.openPost(id).catch((e) => {
      if (status)
        status.textContent = e.message === "NOT_FOUND" ? "This post is gone." : "Please try again.";
    }));
