# AGENTS

- Never gitignore `.env`: it holds only public settings and the publish build needs it, or the live app loses its backend connection.
- Keep QC form completeness rules in the browser-safe qc-validation module and run them before both create and edit saves so the two paths enforce the same requirements.
- Store unfinished part pallets separately from final QC records; complete them with a version-checked atomic RPC so drafts cannot affect production, shipping, or assemblies and cannot be completed twice.
