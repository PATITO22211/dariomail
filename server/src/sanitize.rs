use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

static REMOTE_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s(?:src|srcset|poster)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#)
        .expect("regex de atributos")
});

/// Limpia HTML de correo. Las imágenes remotas se quitan salvo que `allow_remote_images` sea cierto.
pub fn sanitize_email_html(html: &str, allow_remote_images: bool) -> String {
    let mut schemes = HashSet::new();
    schemes.insert("http");
    schemes.insert("https");
    schemes.insert("mailto");
    schemes.insert("cid");
    schemes.insert("data");
    let mut builder = ammonia::Builder::default();
    builder.url_schemes(schemes);
    let cleaned = builder.clean(html).to_string();
    if allow_remote_images {
        return cleaned;
    }
    strip_remote_media(&cleaned)
}

pub fn text_to_html(text: &str) -> String {
    if text.trim().is_empty() {
        return "<p></p>".to_string();
    }
    text.split("\n\n")
        .map(|para| {
            let escaped = escape_html(para).replace('\n', "<br>");
            format!("<p>{escaped}</p>")
        })
        .collect()
}

pub fn html_to_text(html: &str) -> String {
    static SCRIPT: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?is)<script[^>]*>.*?</script>").expect("regex script"));
    static STYLE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?is)<style[^>]*>.*?</style>").expect("regex style"));
    static TAGS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]+>").expect("regex tags"));
    let no_script = SCRIPT.replace_all(html, " ");
    let no_style = STYLE.replace_all(&no_script, " ");
    let stripped = TAGS.replace_all(&no_style, " ");
    unescape_basic(&stripped)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_remote_media(html: &str) -> String {
    REMOTE_ATTR
        .replace_all(html, |caps: &regex::Captures| {
            let whole = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            let value = attr_value(whole);
            if is_remote_url(value) {
                String::new()
            } else {
                whole.to_string()
            }
        })
        .into_owned()
}

fn attr_value(attr: &str) -> &str {
    let Some(eq) = attr.find('=') else {
        return "";
    };
    let raw = attr[eq + 1..].trim();
    let bytes = raw.as_bytes();
    if bytes.len() >= 2
        && (bytes[0] == b'"' || bytes[0] == b'\'')
        && bytes[bytes.len() - 1] == bytes[0]
    {
        &raw[1..raw.len() - 1]
    } else {
        raw
    }
}

pub fn contains_remote_images(html: &str) -> bool {
    REMOTE_ATTR.captures_iter(html).any(|caps| {
        caps.get(0)
            .map(|item| is_remote_url(attr_value(item.as_str())))
            .unwrap_or(false)
    })
}

pub fn is_remote_url(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("//")
        || lower.starts_with("\\\\")
        || lower.split_whitespace().any(|part| {
            let part = part.trim_matches(|c| c == ',' || c == '"' || c == '\'');
            let part = part.to_ascii_lowercase();
            part.starts_with("http:") || part.starts_with("https:") || part.starts_with("//")
        })
}

pub fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn unescape_basic(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_active_content_and_remote_images() {
        let dirty = r#"<p onclick="alert(1)">Hola</p><script>evil()</script><a href="javascript:steal()">enlace</a><img src="https://evil.test/a.png" alt="foto"><img src="cid:logo" alt="local">"#;
        let clean = sanitize_email_html(dirty, false);
        assert!(!clean.to_lowercase().contains("<script"));
        assert!(!clean.to_lowercase().contains("onclick"));
        assert!(!clean.to_lowercase().contains("javascript:"));
        assert!(!clean.contains("https://evil.test"));
        assert!(clean.contains("cid:logo"));
        assert!(clean.contains("Hola"));
        assert!(clean.contains("enlace"));
    }

    #[test]
    fn keeps_remote_images_when_asked() {
        let dirty = r#"<img src="https://cdn.test/a.png" alt="foto">"#;
        let clean = sanitize_email_html(dirty, true);
        assert!(clean.contains("https://cdn.test/a.png"));
    }

    #[test]
    fn drops_protocol_relative_and_srcset() {
        let dirty = r#"<img src="//cdn.test/a.png" srcset="https://cdn.test/a.png 1x, https://cdn.test/b.png 2x">"#;
        let clean = sanitize_email_html(dirty, false);
        assert!(!clean.contains("cdn.test"));
    }

    #[test]
    fn text_roundtrip_helpers() {
        assert!(text_to_html("Hola\n\nMundo").contains("<p>Hola</p>"));
        assert_eq!(html_to_text("<p>Hola &amp; <b>tú</b></p>"), "Hola & tú");
    }
}
