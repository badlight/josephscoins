(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./coin-utils.js"));
  else root.CoinPublisher = factory(root.CoinKit);
})(typeof window !== "undefined" ? window : this, function (Kit) {
  "use strict";
  const REPOSITORY = "badlight/josephscoins", BRANCH = "master";
  function decode64(value) {
    if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("utf8");
    return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, "")), char => char.charCodeAt(0)));
  }
  function encode64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let result = "";
    for (let index = 0; index < bytes.length; index += 32768) result += String.fromCharCode.apply(null, bytes.subarray(index, index + 32768));
    return btoa(result);
  }
  async function publish(options) {
    const { changes, onProgress = () => {}, fetcher = fetch } = options;
    let token = String(options.token || "").trim();
    if (!token) throw Error("Enter a GitHub token with Contents: Read and write for badlight/josephscoins.");
    if (!Array.isArray(changes) || !changes.length) throw Error("Add, edit, or delete a coin in the batch first.");
    async function request(path, method, body) {
      const response = await fetcher("https://api.github.com/repos/" + REPOSITORY + "/" + path, {
        method: method || "GET",
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw Error("GitHub rejected the token or its permissions. Use Contents: Read and write for this repository.");
        if (path.startsWith("git/refs/") && method === "PATCH") throw Error("GitHub changed while publishing. No existing commit was overwritten. Your batch is saved; try again after reviewing the latest records.");
        throw Error("GitHub request failed (" + response.status + "): " + (result.message || "Please retry."));
      }
      return result;
    }
    try {
      onProgress("Checking the latest collection…");
      const ref = await request("git/ref/heads/" + BRANCH);
      const head = ref.object.sha;
      const [commit, content] = await Promise.all([request("git/commits/" + head), request("contents/coins.json?ref=" + head)]);
      if (!content.content) throw Error("The GitHub catalogue could not be read.");
      const remote = JSON.parse(decode64(content.content));
      Kit.validate(remote);
      const catalogue = Kit.mergeChanges(remote, changes);
      const tree = [], seen = new Set();
      for (const change of changes) {
        if (change.action === "delete") continue;
        for (const asset of change.assets || []) {
          if (!asset.path.startsWith("images/" + change.coin.file + "/") || asset.path.includes("..") || asset.path.includes("\\")) throw Error("Invalid image destination.");
          if (seen.has(asset.path)) throw Error("Two staged images use the same destination.");
          seen.add(asset.path);
          onProgress("Uploading photograph " + seen.size + "…");
          const bytes = new Uint8Array(await asset.blob.arrayBuffer());
          const blob = await request("git/blobs", "POST", { content: encode64(bytes), encoding: "base64" });
          tree.push({ path: asset.path, mode: "100644", type: "blob", sha: blob.sha });
        }
      }
      tree.push({ path: "coins.json", mode: "100644", type: "blob", content: JSON.stringify(catalogue, null, 2) + "\n" });
      onProgress("Saving " + changes.length + " catalogue change" + (changes.length === 1 ? "" : "s") + "…");
      const newTree = await request("git/trees", "POST", { base_tree: commit.tree.sha, tree });
      const newCommit = await request("git/commits", "POST", { message: "Update " + changes.length + " coin record" + (changes.length === 1 ? "" : "s") + " from collection editor", tree: newTree.sha, parents: [head] });
      await request("git/refs/heads/" + BRANCH, "PATCH", { sha: newCommit.sha, force: false });
      return { sha: newCommit.sha, url: "https://github.com/" + REPOSITORY + "/commit/" + newCommit.sha, catalogue };
    } finally { token = ""; }
  }
  return { REPOSITORY, BRANCH, publish, decode64 };
});

