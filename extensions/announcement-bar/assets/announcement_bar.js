(function() {
  function initAnnouncementBar() {
    const banner = document.getElementById("ShopifyAppAnnouncementBar");
    const closeBtn = document.getElementById("ShopifyAppAnnouncementClose");
    
    if (!banner) return;
    
    // Check sessionStorage to see if the user already dismissed it
    if (sessionStorage.getItem("shopify-announcement-dismissed") === "true") {
      banner.style.display = "none";
      return;
    }
    
    // If not dismissed, add the active class to adjust page layout/margins
    document.documentElement.classList.add("shopify-app-announcement-active");
    
    // Wire up close button click event
    if (closeBtn) {
      closeBtn.addEventListener("click", function() {
        banner.style.transition = "transform 0.3s ease, opacity 0.3s ease";
        banner.style.transform = "translateY(-100%)";
        banner.style.opacity = "0";
        
        document.documentElement.classList.remove("shopify-app-announcement-active");
        sessionStorage.setItem("shopify-announcement-dismissed", "true");
        
        setTimeout(function() {
          banner.style.display = "none";
        }, 300);
      });
    }
  }

  // Support both DOMContentLoaded and immediate load if script runs deferred
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAnnouncementBar);
  } else {
    initAnnouncementBar();
  }
})();
