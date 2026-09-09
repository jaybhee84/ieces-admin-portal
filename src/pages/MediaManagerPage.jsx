import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase, TABLE, BUCKET, HOMEPAGE_BUCKET, HOMEPAGE_SLIDES_TABLE } from "../lib/supabase";
import mediaManagerLogo from "../image/media.png";
import "./MediaManagerPage.css";

const FILTERS = ["pending", "approved", "rejected", "all"];
const TABS = [
  { id: "articles", label: "Media Manager" },
  { id: "homepage", label: "Homepage" },
];
const ROLE_LABELS = { teacher: "Teacher", student: "Student", admin: "Admin" };

function MediaIcon({ home = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {home ? <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-8h6v8" /></> : <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>}
    </svg>
  );
}

function SectionHeading({ home = false, loading, onRefresh }) {
  return (
    <section className="media-heading">
      <div className="media-heading-identity">
        <span className={`media-brand-mark${home ? "" : " media-brand-mark-logo"}`}>
          {home ? <MediaIcon home /> : <img src={mediaManagerLogo} alt="" />}
        </span>
        <div>
          <span className="media-eyebrow">School website / {home ? "Homepage" : "Editorial"}</span>
          <h1>{home ? "Homepage Slideshow" : "IECES Media Manager"}</h1>
          <p>{home ? "Create a welcoming first impression with your school's latest photos." : "Review and publish the stories that bring our school community together."}</p>
        </div>
      </div>
      <button className="media-refresh" onClick={onRefresh} disabled={loading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </section>
  );
}

function EditArticleModal({ article, onSave, onCancel, addToast }) {
  const [title, setTitle] = useState(article.title || "");
  const [category, setCategory] = useState(article.category || "");
  const [author, setAuthor] = useState(article.author || "");
  const [description, setDescription] = useState(article.description || "");
  const [day, setDay] = useState(article.day || "");
  const [month, setMonth] = useState(article.month || "");
  const [year, setYear] = useState(article.year || "");
  const [newPhoto, setNewPhoto] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handlePhotoChange = (file) => {
    setNewPhoto(file || null);
    setNewPhotoPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleSave = async () => {
    if (!title.trim()) {
      addToast("Enter a title for the article.", "warning");
      return;
    }

    setSaving(true);
    let photos = article.photos || [];

    if (newPhoto) {
      const safeName = newPhoto.name.replace(/\s+/g, "_");
      const path = `articles/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, newPhoto, { upsert: true });

      if (uploadError) {
        setSaving(false);
        addToast(`Could not upload photo: ${uploadError.message}`, "error", 5000);
        return;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      photos = [urlData.publicUrl, ...photos.slice(1)];
    }

    const payload = {
      title: title.trim(),
      category: category.trim(),
      author: author.trim(),
      description: description.trim(),
      day: day.toString().trim(),
      month: month.toString().trim(),
      year: year.toString().trim(),
      photos,
    };

    const { error: updateError } = await supabase.from(TABLE).update(payload).eq("id", article.id);
    setSaving(false);

    if (updateError) {
      addToast(`Could not update article: ${updateError.message}`, "error", 5000);
      return;
    }

    onSave({ ...article, ...payload });
    addToast("Article updated.", "success");
  };

  return (
    <div className="focal-overlay" onClick={onCancel}>
      <div className="focal-dialog edit-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Article</h3>
        <p>Update the details below. Changes are saved to the live article on the website.</p>

        <div className="edit-form-grid">
          <label className="edit-field edit-field-wide">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
          </label>
          <label className="edit-field">
            <span>Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Academics" />
          </label>
          <label className="edit-field">
            <span>Author</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" />
          </label>
          <label className="edit-field edit-field-wide">
            <span>Description</span>
            <textarea rows="4" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Article description" />
          </label>
          <label className="edit-field">
            <span>Month</span>
            <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="e.g. September" />
          </label>
          <label className="edit-field">
            <span>Day</span>
            <input value={day} onChange={(e) => setDay(e.target.value)} placeholder="e.g. 9" />
          </label>
          <label className="edit-field">
            <span>Year</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2026" />
          </label>
          <label className="edit-field edit-field-wide">
            <span>Replace photo (optional)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            />
          </label>
        </div>

        <img
          className="edit-photo-preview"
          src={newPhotoPreview || article.photos?.[0]}
          alt=""
          hidden={!newPhotoPreview && !article.photos?.[0]}
        />

        <div className="focal-actions">
          <button className="focal-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="focal-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArticlesTab({ addToast, showConfirm }) {
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from(TABLE)
      .select("id,author,author_role,title,category,description,photos,day,month,year,created_at,status")
      .order("created_at", { ascending: false });

    if (queryError) {
      const lowerMessage = queryError.message?.toLowerCase() || "";
      const missingStatus = lowerMessage.includes("status");
      const missingRole = lowerMessage.includes("author_role");
      setError(missingRole
        ? "The role-based approval migration has not been applied yet. Run supabase-news-role-approval.sql in the Supabase SQL Editor."
        : missingStatus
        ? "The approval database migration has not been applied yet. Run supabase-news-approval.sql in the Supabase SQL Editor."
        : queryError.message);
    } else {
      setArticles(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchArticles();
    const channel = supabase
      .channel("dashboard:news-approval")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, fetchArticles)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchArticles]);

  const counts = useMemo(() => articles.reduce((total, article) => {
    const status = article.status || "approved";
    total[status] = (total[status] || 0) + 1;
    return total;
  }, { pending: 0, approved: 0, rejected: 0 }), [articles]);

  const visibleArticles = filter === "all"
    ? articles
    : articles.filter((article) => (article.status || "approved") === filter);

  const setStatus = async (article, status) => {
    const action = status === "approved" ? "approve" : "reject";
    const confirmed = await showConfirm(`Are you sure you want to ${action} “${article.title}”?`);
    if (!confirmed) return;

    setUpdatingId(article.id);
    const { error: updateError } = await supabase
      .from(TABLE)
      .update({ status })
      .eq("id", article.id);

    if (updateError) {
      addToast(`Could not ${action} article: ${updateError.message}`, "error", 5000);
    } else {
      setArticles((current) => current.map((item) =>
        item.id === article.id ? { ...item, status } : item
      ));
      addToast(`Article ${status}.`, "success");
    }
    setUpdatingId(null);
  };

  return (
    <>
      <SectionHeading loading={loading} onRefresh={fetchArticles} />
      <div className="media-section-label"><h2>Article review</h2><span>Teacher posts publish automatically · student posts wait for approval · edit any article anytime</span></div>

      <div className="media-filters" role="group" aria-label="Article status">
        {FILTERS.map((status) => (
          <button
            key={status}
            className={filter === status ? "active" : ""}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status[0].toUpperCase() + status.slice(1)}
            <span>{status === "all" ? articles.length : counts[status]}</span>
          </button>
        ))}
      </div>

      {error && <div className="media-message media-error">{error}</div>}
      {loading && <div className="media-message">Loading articles…</div>}
      {!loading && !error && visibleArticles.length === 0 && (
        <div className="media-message media-empty">
          <span className="media-empty-icon"><MediaIcon /></span>
          <h3>{filter === "pending" ? "You're all caught up" : `No ${filter === "all" ? "" : filter + " "}articles yet`}</h3>
          <p>{filter === "pending" ? "New submissions will appear here when they're ready for your review." : "Articles will appear here as you review and publish submissions."}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="article-list">
          {visibleArticles.map((article) => {
            const status = article.status || "approved";
            const photo = article.photos?.[0];
            const role = article.author_role || "student";
            return (
              <article className="approval-card" key={article.id}>
                {photo ? <img src={photo} alt="" className="approval-photo" /> : <div className="approval-photo empty">📰</div>}
                <div className="approval-content">
                  <div className="approval-meta">
                    <span className={`approval-status status-${status}`}>{status}</span>
                    <span className={`approval-role role-${role}`}>{ROLE_LABELS[role] || role}</span>
                    <span>{article.category}</span>
                    <span>{article.author ? `By ${article.author}` : "No author"}</span>
                  </div>
                  <h2>{article.title}</h2>
                  <p>{article.description}</p>
                  <div className="approval-footer">
                    <span>
                      {[article.month, article.day, article.year].filter(Boolean).join(" ") ||
                        new Date(article.created_at).toLocaleDateString()}
                    </span>
                    <div className="approval-actions">
                      <button className="edit" disabled={updatingId === article.id} onClick={() => setEditingArticle(article)}>Edit</button>
                      {status !== "rejected" && (
                        <button className="reject" disabled={updatingId === article.id} onClick={() => setStatus(article, "rejected")}>Reject</button>
                      )}
                      {status !== "approved" && (
                        <button className="approve" disabled={updatingId === article.id} onClick={() => setStatus(article, "approved")}>Approve & Publish</button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingArticle && (
        <EditArticleModal
          article={editingArticle}
          addToast={addToast}
          onCancel={() => setEditingArticle(null)}
          onSave={(updated) => {
            setArticles((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            setEditingArticle(null);
          }}
        />
      )}
    </>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function FocalPointAdjuster({ slide, onSave, onCancel }) {
  const [focalX, setFocalX] = useState(slide.focal_x ?? 50);
  const [focalY, setFocalY] = useState(slide.focal_y ?? 50);
  const [zoom, setZoom] = useState(slide.zoom ?? 1);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const dragRef = useRef(null);

  const applyDrag = (clientX, clientY) => {
    const box = boxRef.current;
    const drag = dragRef.current;
    if (!box || !drag) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    const nextX = drag.startFocalX - (dx / box.clientWidth) * 100;
    const nextY = drag.startFocalY - (dy / box.clientHeight) * 100;
    setFocalX(Math.min(100, Math.max(0, nextX)));
    setFocalY(Math.min(100, Math.max(0, nextY)));
  };

  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", stopDrag);
  };

  const handleMouseMove = (e) => applyDrag(e.clientX, e.clientY);
  const handleTouchMove = (e) => {
    if (e.touches[0]) applyDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const startDrag = (clientX, clientY) => {
    dragRef.current = { startX: clientX, startY: clientY, startFocalX: focalX, startFocalY: focalY };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopDrag);
  };

  const handleWheelZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(current + delta).toFixed(2))));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from(HOMEPAGE_SLIDES_TABLE)
      .update({ focal_x: focalX, focal_y: focalY, zoom })
      .eq("id", slide.id);
    setSaving(false);
    if (!error) onSave(focalX, focalY, zoom);
  };

  return (
    <div className="focal-overlay" onClick={onCancel}>
      <div className="focal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Adjust Photo Position</h3>
        <p>Drag the photo to reposition it, and use the zoom slider or scroll wheel to zoom in.</p>
        <div
          className="focal-box"
          ref={boxRef}
          onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onTouchStart={(e) => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          onWheel={handleWheelZoom}
        >
          <img
            src={slide.image_url}
            alt=""
            draggable={false}
            style={{
              objectPosition: `${focalX}% ${focalY}%`,
              transformOrigin: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom})`,
            }}
          />
        </div>
        <div className="focal-zoom-row">
          <span className="focal-zoom-icon">−</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
          <span className="focal-zoom-icon">+</span>
        </div>
        <div className="focal-actions">
          <button className="focal-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="focal-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Position"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HomepageTab({ addToast, showConfirm }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [adjustingSlide, setAdjustingSlide] = useState(null);
  const fileInputRef = useRef(null);

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from(HOMEPAGE_SLIDES_TABLE)
      .select("id,image_url,storage_path,sort_order,focal_x,focal_y,zoom,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (queryError) {
      const message = queryError.message?.toLowerCase() || "";
      const missingTable = message.includes("does not exist") || message.includes("could not find the table");
      const missingFocalColumn = missingTable && message.includes("focal");
      const missingZoomColumn = missingTable && message.includes("zoom");
      setError(missingZoomColumn
        ? "The zoom migration has not been applied yet. Run supabase-homepage-slides-zoom.sql in the Supabase SQL Editor."
        : missingFocalColumn
        ? "The focal point migration has not been applied yet. Run supabase-homepage-slides-focal-point.sql in the Supabase SQL Editor."
        : missingTable
        ? "The homepage slideshow database migration has not been applied yet. Run supabase-homepage-slides.sql in the Supabase SQL Editor."
        : queryError.message);
    } else {
      setSlides(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSlides();
    const channel = supabase
      .channel("dashboard:homepage-slides")
      .on("postgres_changes", { event: "*", schema: "public", table: HOMEPAGE_SLIDES_TABLE }, fetchSlides)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchSlides]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    let nextOrder = slides.length ? Math.max(...slides.map((s) => s.sort_order ?? 0)) + 1 : 0;
    let failures = 0;

    for (const file of files) {
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `slides/${Date.now()}_${nextOrder}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(HOMEPAGE_BUCKET)
        .upload(path, file, { upsert: true });

      if (upErr) {
        failures += 1;
        continue;
      }

      const { data: urlData } = supabase.storage.from(HOMEPAGE_BUCKET).getPublicUrl(path);
      const { error: insertError } = await supabase.from(HOMEPAGE_SLIDES_TABLE).insert({
        image_url: urlData.publicUrl,
        storage_path: path,
        sort_order: nextOrder,
      });

      if (insertError) failures += 1;
      nextOrder += 1;
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (failures > 0) {
      addToast(`${failures} photo${failures > 1 ? "s" : ""} failed to upload.`, "error", 5000);
    } else {
      addToast(`${files.length} photo${files.length > 1 ? "s" : ""} added to the homepage slideshow.`, "success");
    }
    fetchSlides();
  };

  const handleDelete = async (slide) => {
    const confirmed = await showConfirm("Remove this photo from the homepage slideshow?");
    if (!confirmed) return;

    setDeletingId(slide.id);
    if (slide.storage_path) {
      await supabase.storage.from(HOMEPAGE_BUCKET).remove([slide.storage_path]);
    }
    const { error: deleteError } = await supabase
      .from(HOMEPAGE_SLIDES_TABLE)
      .delete()
      .eq("id", slide.id);

    if (deleteError) {
      addToast(`Could not remove photo: ${deleteError.message}`, "error", 5000);
    } else {
      setSlides((current) => current.filter((item) => item.id !== slide.id));
      addToast("Photo removed.", "success");
    }
    setDeletingId(null);
  };

  return (
    <>
      <SectionHeading home loading={loading} onRefresh={fetchSlides} />

      <div className="media-message homepage-note">
        <span className="homepage-note-icon"><MediaIcon home /></span>
        <div><strong>Your homepage, at a glance</strong><p>The welcome banner always appears first. Add photos below and adjust their framing for the perfect fit.</p></div>
      </div>

      {error && <div className="media-message media-error">{error}</div>}
      {loading && <div className="media-message">Loading photos…</div>}

      {!loading && !error && (
        <>
          <div className="media-section-label"><h2>Slideshow library</h2><span>{slides.length + 1} photos / Includes the default banner</span></div>
          <div className="slide-grid">
            <div className="slide-card slide-locked" title="Default homepage banner — always shown first">
              <div className="slide-locked-art"><MediaIcon home /><strong>Welcome to IECES</strong><span>School homepage banner</span></div>
              <div className="slide-caption">
                <span>Welcome Banner</span>
                <span className="slide-badge">Default</span>
              </div>
            </div>

            {slides.map((slide, index) => (
              <div className="slide-card" key={slide.id}>
                <div className="slide-preview"><img
                  src={slide.image_url}
                  alt={`Homepage slideshow photo ${index + 2}`}
                  style={{
                    objectPosition: `${slide.focal_x ?? 50}% ${slide.focal_y ?? 50}%`,
                    transformOrigin: `${slide.focal_x ?? 50}% ${slide.focal_y ?? 50}%`,
                    transform: `scale(${slide.zoom ?? 1})`,
                  }}
                /></div>
                <div className="slide-caption">
                  <span>Homepage photo {index + 2}</span>
                  <div className="slide-caption-actions">
                    <button className="slide-adjust" onClick={() => setAdjustingSlide(slide)}>
                      Adjust
                    </button>
                    <button
                      className="slide-delete"
                      disabled={deletingId === slide.id}
                      onClick={() => handleDelete(slide)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="upload-slide-panel">
            <span className="upload-panel-icon"><MediaIcon /></span>
            <div><strong>Add a new perspective</strong><p>Choose photos from your device to feature on the homepage.</p></div>
            <button type="button" className="upload-slide-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? "Uploading..." : "+ Add photos"}</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </>
      )}

      {adjustingSlide && (
        <FocalPointAdjuster
          slide={adjustingSlide}
          onCancel={() => setAdjustingSlide(null)}
          onSave={(focalX, focalY, zoom) => {
            setSlides((current) => current.map((item) =>
              item.id === adjustingSlide.id ? { ...item, focal_x: focalX, focal_y: focalY, zoom } : item
            ));
            setAdjustingSlide(null);
            addToast("Photo position saved.", "success");
          }}
        />
      )}
    </>
  );
}

export default function MediaManagerPage({ user, onLogout, onBack, addToast, showConfirm }) {
  const [tab, setTab] = useState("articles");

  return (
    <div className="media-root">
      <Topbar user={user} onLogout={onLogout} onBack={onBack} title="Media and Homepage" />
      <main className="media-body">
        <div className="media-tabs" role="group" aria-label="Media and Homepage sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <MediaIcon home={t.id === "homepage"} />{t.label}
            </button>
          ))}
        </div>

        {tab === "articles"
          ? <ArticlesTab addToast={addToast} showConfirm={showConfirm} />
          : <HomepageTab addToast={addToast} showConfirm={showConfirm} />}
      </main>
    </div>
  );
}
