import { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import "./SchoolBulletinPage.css";

const TABLE = "bulletin_announcements";
const BUCKET = "bulletin-files";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const TITLE_OPTIONS = ["Class Suspension", "Announcement", "Others"];
const EMPTY_FORM = {
  title_type: "Announcement",
  custom_title: "",
  summary: "",
  body: "",
  priority: "normal",
  expires_at: "",
  is_published: true,
  attachment_file: null,
  attachment_url: "",
  attachment_name: "",
  attachment_storage_path: "",
  remove_attachment: false,
};

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const formatDate = (value) => new Date(value).toLocaleString("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function SchoolBulletinPage({ user, onLogout, onBack, addToast, showConfirm }) {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const listRef = useRef(null);

  const loadAnnouncements = useCallback(async () => {
    setError("");
    const { data, error: queryError } = await supabase
      .from(TABLE)
      .select("id,title,summary,body,priority,is_published,published_at,expires_at,attachment_url,attachment_name,attachment_storage_path,created_by,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (queryError) {
      const message = queryError.code === "42P01"
        ? "The bulletin table is not ready. Run supabase-school-bulletin.sql in the Supabase SQL Editor."
        : queryError.message || "Could not load bulletin announcements.";
      setError(message);
    } else {
      setAnnouncements(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnnouncements();
    const channel = supabase
      .channel("report:school-bulletin")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, loadAnnouncements)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAnnouncements]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    const title = form.title_type === "Others" ? form.custom_title.trim() : form.title_type;
    if (!title) {
      addToast("Enter a title for the notice.", "warning");
      return;
    }

    if (form.is_published && form.expires_at && new Date(form.expires_at) <= new Date()) {
      addToast("Choose a future expiry date or clear it before publishing.", "warning");
      return;
    }

    if (form.attachment_file && form.attachment_file.size > MAX_FILE_SIZE) {
      addToast("The attachment must be 25 MB or smaller.", "warning");
      return;
    }

    setSaving(true);
    const existing = announcements.find((item) => item.id === editingId);
    let uploadedAttachment = null;

    if (form.attachment_file) {
      const safeName = form.attachment_file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const storagePath = `${user?.id || "bulletin"}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, form.attachment_file, {
          contentType: form.attachment_file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        setSaving(false);
        addToast(uploadError.message || "Could not upload the attachment.", "error", 5000);
        return;
      }

      uploadedAttachment = {
        attachment_url: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
        attachment_name: form.attachment_file.name,
        attachment_storage_path: storagePath,
      };
    }

    const attachment = uploadedAttachment || (form.remove_attachment
      ? { attachment_url: null, attachment_name: null, attachment_storage_path: null }
      : {
          attachment_url: form.attachment_url || null,
          attachment_name: form.attachment_name || null,
          attachment_storage_path: form.attachment_storage_path || null,
        });
    const payload = {
      title,
      summary: form.summary.trim() || null,
      body: form.body.trim() || null,
      priority: form.priority,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_published: form.is_published,
      published_at: form.is_published ? existing?.published_at || new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      ...attachment,
    };

    const result = editingId
      ? await supabase.from(TABLE).update(payload).eq("id", editingId).select().single()
      : await supabase.from(TABLE).insert({ ...payload, created_by: user?.email || null }).select().single();

    setSaving(false);
    if (result.error) {
      if (uploadedAttachment?.attachment_storage_path) {
        await supabase.storage.from(BUCKET).remove([uploadedAttachment.attachment_storage_path]);
      }
      addToast(result.error.message || "Could not save the announcement.", "error", 5000);
      return;
    }

    const previousPath = existing?.attachment_storage_path;
    if (previousPath && (uploadedAttachment || form.remove_attachment)) {
      await supabase.storage.from(BUCKET).remove([previousPath]);
    }

    setAnnouncements((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
    addToast(form.is_published ? "Announcement published. It is available to the website." : "Draft saved. Publish it to show it on the website.", "success");
    resetForm();
    await loadAnnouncements();
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editAnnouncement = (announcement) => {
    const knownTitle = TITLE_OPTIONS.slice(0, -1).includes(announcement.title);
    setEditingId(announcement.id);
    setForm({
      title_type: knownTitle ? announcement.title : "Others",
      custom_title: knownTitle ? "" : announcement.title || "",
      summary: announcement.summary || "",
      body: announcement.body || "",
      priority: announcement.priority || "normal",
      expires_at: toLocalInput(announcement.expires_at),
      is_published: Boolean(announcement.is_published),
      attachment_file: null,
      attachment_url: announcement.attachment_url || "",
      attachment_name: announcement.attachment_name || "",
      attachment_storage_path: announcement.attachment_storage_path || "",
      remove_attachment: false,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    document.querySelector(".bulletin-body")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePublished = async (announcement) => {
    const publish = !announcement.is_published;
    if (publish && announcement.expires_at && new Date(announcement.expires_at) <= new Date()) {
      addToast("Edit this notice and clear or extend its expiry date before publishing.", "warning");
      editAnnouncement(announcement);
      return;
    }
    const { error: updateError } = await supabase
      .from(TABLE)
      .update({
        is_published: publish,
        published_at: publish ? announcement.published_at || new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", announcement.id).select().single();

    if (updateError) addToast(updateError.message || "Could not change publication status.", "error", 5000);
    else addToast(publish ? "Announcement published." : "Announcement returned to draft.", "success");
    await loadAnnouncements();
  };

  const deleteAnnouncement = async (announcement) => {
    const confirmed = await showConfirm(`Delete “${announcement.title}”? This cannot be undone.`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from(TABLE).delete().eq("id", announcement.id);
    if (deleteError) {
      addToast(deleteError.message || "Could not delete the announcement.", "error", 5000);
      return;
    }
    if (announcement.attachment_storage_path) {
      await supabase.storage.from(BUCKET).remove([announcement.attachment_storage_path]);
    }
    addToast("Announcement deleted.", "success");
    if (editingId === announcement.id) resetForm();
    await loadAnnouncements();
  };

  return (
    <div className="bulletin-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="School Bulletin" />
      <main className="bulletin-body">
        <header className="bulletin-hero">
          <div>
            <span>Public website content</span>
            <h1>School Bulletin</h1>
            <p>Manage class suspensions, office orders, and official notices shown on Project Rising.</p>
          </div>
        </header>

        <form className="bulletin-form" onSubmit={saveAnnouncement}>
          <div className="bulletin-form-heading">
            <div>
              <strong>{editingId ? "Edit announcement" : "New announcement"}</strong>
              <span>Only published, non-expired notices appear on the public website.</span>
            </div>
            {editingId && <button type="button" className="bulletin-button ghost" onClick={resetForm}>Cancel editing</button>}
          </div>

          <label className="bulletin-field bulletin-field-wide">
            <span>Title</span>
            <select value={form.title_type} onChange={(event) => updateField("title_type", event.target.value)}>
              {TITLE_OPTIONS.map((title) => <option value={title} key={title}>{title}</option>)}
            </select>
          </label>
          {form.title_type === "Others" && (
            <label className="bulletin-field bulletin-field-wide">
              <span>Custom title</span>
              <input value={form.custom_title} maxLength={180} onChange={(event) => updateField("custom_title", event.target.value)} placeholder="Enter the official notice title" required />
            </label>
          )}
          <label className="bulletin-field bulletin-field-wide">
            <span>Short summary</span>
            <textarea rows="2" maxLength={500} value={form.summary} onChange={(event) => updateField("summary", event.target.value)} placeholder="A concise summary shown below the title" />
          </label>
          <label className="bulletin-field bulletin-field-wide">
            <span>Full notice</span>
            <textarea rows="6" value={form.body} onChange={(event) => updateField("body", event.target.value)} placeholder="Complete announcement details, instructions, or reminders" />
          </label>
          <label className="bulletin-field bulletin-field-wide">
            <span>Attachment (optional, maximum 25 MB)</span>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(event) => updateField("attachment_file", event.target.files?.[0] || null)}
            />
            <small className="bulletin-file-help">Upload a Word document, PDF, image, spreadsheet, or other public file.</small>
          </label>
          {form.attachment_url && !form.attachment_file && (
            <div className="bulletin-current-file">
              <a href={form.attachment_url} target="_blank" rel="noreferrer">📎 {form.attachment_name || "Current attachment"}</a>
              <label>
                <input type="checkbox" checked={form.remove_attachment} onChange={(event) => updateField("remove_attachment", event.target.checked)} />
                Remove this attachment when saving
              </label>
            </div>
          )}
          <label className="bulletin-field">
            <span>Priority</span>
            <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="bulletin-field">
            <span>Expires on (optional)</span>
            <input type="datetime-local" value={form.expires_at} onChange={(event) => updateField("expires_at", event.target.value)} />
          </label>
          <label className="bulletin-publish-toggle">
            <input type="checkbox" checked={form.is_published} onChange={(event) => updateField("is_published", event.target.checked)} />
            <span><strong>Publish immediately</strong><small>Make this notice visible on Project Rising after saving.</small></span>
          </label>
          <div className="bulletin-form-actions">
            <button className="bulletin-button primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : form.is_published ? "Post announcement" : "Save draft"}</button>
          </div>
        </form>

        <div className="bulletin-list-heading" ref={listRef}>
          <div><strong>Posted announcements and drafts</strong><span>{announcements.length} total · Edit a notice below to update it.</span></div>
          <button type="button" className="bulletin-button ghost" onClick={loadAnnouncements} disabled={loading}>Refresh</button>
        </div>

        {error && <div className="bulletin-message bulletin-error">{error}</div>}
        {loading && <div className="bulletin-message">Loading announcements…</div>}
        {!loading && !error && announcements.length === 0 && (
          <div className="bulletin-empty"><b>📌</b><strong>No announcements yet</strong><span>Create the first bulletin notice using the form above.</span></div>
        )}
        {!loading && !error && announcements.length > 0 && (
          <div className="bulletin-list">
            {announcements.map((announcement) => {
              const expired = announcement.expires_at && new Date(announcement.expires_at) < new Date();
              return (
                <article className={`bulletin-row${expired ? " expired" : ""}`} key={announcement.id}>
                  <div>
                    <div className="bulletin-row-badges">
                      <span className={`bulletin-priority ${announcement.priority}`}>{announcement.priority}</span>
                      <span className={announcement.is_published ? "bulletin-status published" : "bulletin-status draft"}>{announcement.is_published ? "Published" : "Draft"}</span>
                      {expired && <span className="bulletin-status expired-label">Expired</span>}
                    </div>
                    <h2>{announcement.title}</h2>
                    {announcement.summary && <p>{announcement.summary}</p>}
                    {announcement.body && <p className="bulletin-notice-body">{announcement.body}</p>}
                    {!announcement.is_published && <p>Draft — publish this notice to show it on the website.</p>}
                    {expired && <p>Hidden from the website because this notice has expired.</p>}
                    {announcement.attachment_url && <a className="bulletin-row-file" href={announcement.attachment_url} target="_blank" rel="noreferrer">📎 {announcement.attachment_name || "View attachment"}</a>}
                    <small>Created {formatDate(announcement.created_at)}{announcement.expires_at ? ` · Expires ${formatDate(announcement.expires_at)}` : ""}</small>
                  </div>
                  <div className="bulletin-row-actions">
                    <button type="button" onClick={() => editAnnouncement(announcement)}>Edit</button>
                    <button type="button" onClick={() => togglePublished(announcement)}>{announcement.is_published ? "Unpublish" : "Publish"}</button>
                    <button type="button" className="danger" onClick={() => deleteAnnouncement(announcement)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
