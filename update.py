import re

with open('src/app/automation/automation-client.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace searching phase
code = code.replace(
    'setJobs(prev => new Map(prev).set(key, { phase: "searching" }));',
    'updateGlobalJobs(key, { phase: "searching" });'
)

# Replace success phase
old_success = """        setJobs(prev => new Map(prev).set(key, {
          phase: "success",
          steps,
          uploadedTo: payload.uploadedTo ?? "",
          destFolder: payload.destFolder ?? "",
          packetName: payload.packetName ?? "",
          commentPosted: payload.commentPosted ?? false,
          alreadyUploaded: payload.alreadyUploaded ?? false,
          isRestored: payload.isRestored ?? true,
        }));"""
new_success = """        updateGlobalJobs(key, {
          phase: "success",
          steps,
          uploadedTo: payload.uploadedTo ?? "",
          destFolder: payload.destFolder ?? "",
          packetName: payload.packetName ?? "",
          commentPosted: payload.commentPosted ?? false,
          alreadyUploaded: payload.alreadyUploaded ?? false,
          isRestored: payload.isRestored ?? true,
        });"""
code = code.replace(old_success, new_success)

# Replace payload error phase
old_err1 = """        setJobs(prev => new Map(prev).set(key, {
          phase: "error",
          steps: steps.length > 0 ? steps : [{ text: `❌ ${payload.error || "Unknown error"}`, type: "error" }],
          error: payload.error || "Failed",
        }));"""
new_err1 = """        updateGlobalJobs(key, {
          phase: "error",
          steps: steps.length > 0 ? steps : [{ text: `❌ ${payload.error || "Unknown error"}`, type: "error" }],
          error: payload.error || "Failed",
        });"""
code = code.replace(old_err1, new_err1)

# Replace catch error phase
old_err2 = """      setJobs(prev => new Map(prev).set(key, {
        phase: "error",
        steps: [{ text: `❌ ${err?.message}`, type: "error" }],
        error: err?.message || "Failed",
      }));"""
new_err2 = """      updateGlobalJobs(key, {
        phase: "error",
        steps: [{ text: `❌ ${err?.message}`, type: "error" }],
        error: err?.message || "Failed",
      });"""
code = code.replace(old_err2, new_err2)

# Replace comment posted
old_comment = """      setJobs(prev => {
        const existing = prev.get(key);
        if (existing?.phase !== "success") return prev;
        return new Map(prev).set(key, { ...existing, commentPosted: true });
      });"""
new_comment = """      const existing = globalJobs.get(key);
      if (existing?.phase === "success") {
        updateGlobalJobs(key, { ...existing, commentPosted: true });
      }"""
code = code.replace(old_comment, new_comment)

# Replace reset job
old_reset = """    setJobs(prev => {
      const m = new Map(prev);
      m.delete(key);
      return m;
    });"""
new_reset = """    globalJobs.delete(key);
    notifyGlobalListeners();"""
code = code.replace(old_reset, new_reset)

with open('src/app/automation/automation-client.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
