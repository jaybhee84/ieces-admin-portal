import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase, TABLE, HOMEPAGE_BUCKET, HOMEPAGE_SLIDES_TABLE } from "../lib/supabase";
import "./MediaManagerPage.css";

const FILTERS = ["pending", "approved", "rejected", "all"];
const TABS = [
  { id: "articles", label: "Media Manager" },
  { id: "homepage", label: "Homepage" },
];

function ArticlesTab({ addToast, showConfirm }) {
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from(TABLE)
      .select("id,author,title,category,description,photos,day,month,year,created_at,status")
      .order("created_at", { ascending: false });

    if (queryError) {
      const missingStatus = queryError.message?.toLowerCase().includes("status");
      setError(missingStatus
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
      <section className="media-heading">
        <div>
          <h1>IECES Media Manager</h1>
          <p>Approve articles before they are displayed on the IECES website.</p>
        </div>
        <button className="media-refresh" onClick={fetchArticles} disabled={loading}>Refresh</button>
      </section>

      <div className="media-filters" role="tablist" aria-label="Article status">
        {FILTERS.map((status) => (
          <button
            key={status}
            className={filter === status ? "active" : ""}
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
        <div className="media-message">No {filter === "all" ? "" : filter} articles found.</div>
      )}

      {!loading && !error && (
        <div className="article-list">
          {visibleArticles.map((article) => {
            const status = article.status || "approved";
            const photo = article.photos?.[0];
            return (
              <article className="approval-card" key={article.id}>
                {photo ? <img src={photo} alt="" className="approval-photo" /> : <div className="approval-photo empty">📰</div>}
                <div className="approval-content">
                  <div className="approval-meta">
                    <span className={`approval-status status-${status}`}>{status}</span>
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
    </>
  );
}

function HomepageTab({ addToast, showConfirm }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from(HOMEPAGE_SLIDES_TABLE)
      .select("id,image_url,storage_path,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (queryError) {
      const message = queryError.message?.toLowerCase() || "";
      const missingTable = message.includes("does not exist") || message.includes("could not find the table");
      setError(missingTable
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
      <section className="media-heading">
        <div>
          <h1>Homepage Slideshow</h1>
          <p>Manage the rotating photos shown on the school website homepage banner.</p>
        </div>
        <button className="media-refresh" onClick={fetchSlides} disabled={loading}>Refresh</button>
      </section>

      <div className="media-message homepage-note">
        The welcome banner below is the default homepage photo — it always shows first and cannot be removed.
        You can freely add or remove the other slideshow photos.
      </div>

      {error && <div className="media-message media-error">{error}</div>}
      {loading && <div className="media-message">Loading photos…</div>}

      {!loading && !error && (
        <>
          <div className="slide-grid">
            <div className="slide-card slide-locked" title="Default homepage banner — always shown first">
              <div className="slide-locked-art">🖼️</div>
              <div className="slide-caption">
                <span>Welcome Banner</span>
                <span className="slide-badge">Default</span>
              </div>
            </div>

            {slides.map((slide) => (
              <div className="slide-card" key={slide.id}>
                <img src={slide.image_url} alt="" />
                <div className="slide-caption">
                  <span>Homepage photo</span>
                  <button
                    className="slide-delete"
                    disabled={deletingId === slide.id}
                    onClick={() => handleDelete(slide)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className={`upload-slide-btn ${uploading ? "disabled" : ""}`}>
            {uploading ? "Uploading…" : "+ Add Photo(s)"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </>
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
        <div className="media-tabs" role="tablist" aria-label="Media and Homepage sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
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
