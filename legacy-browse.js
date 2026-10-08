(function () {
  "use strict";
  const browse = document.body.dataset.browse;
  const url = new URL("../", location.href);
  url.searchParams.set("browse", browse);
  location.replace(url.href);
})();
