"""Check rendered metadata, canonical URLs, JSON-LD and preview indexing policy."""
import json
import struct
import os
from pathlib import Path
from html.parser import HTMLParser
import sys
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.title = ''
        self.metas = []
        self.canonicals = []
        self.schemas = []
        self.h1_count = 0
        self.in_title = False
        self.in_schema = False
        self.schema_text = ''
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'title':
            self.in_title = True
        if tag == 'h1':
            self.h1_count += 1
        if tag == 'meta':
            self.metas.append(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonicals.append(attrs.get('href'))
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.in_schema = True
            self.schema_text = ''

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script' and self.in_schema:
            self.schemas.append(json.loads(self.schema_text))
            self.in_schema = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_schema:
            self.schema_text += data

    def meta(self, key):
        return [item.get('content', '') for item in self.metas
                if item.get('name') == key or item.get('property') == key]


def check(output, origin, base_path, indexable):
    root_url = urljoin(origin.rstrip('/') + '/', base_path)
    descriptions = set()
    canonical_urls = set()
    pages = sorted(output.rglob('*.html'))
    assert pages, 'No built HTML pages'
    for file in pages:
        route = file.relative_to(output).as_posix()
        page = Page(file.read_text())
        robots = ','.join(page.meta('robots')).lower()
        utility = route in {'404.html', 'search/index.html', 'search.html'}
        if not indexable or utility:
            assert 'noindex' in robots, f'{route}: missing noindex'
        else:
            assert 'noindex' not in robots, f'{route}: unexpectedly excluded from indexing'
        if utility:
            continue
        assert page.title and 'README' not in page.title, f'{route}: missing/descriptive title'
        assert page.h1_count == 1, f'{route}: expected one H1, got {page.h1_count}'
        description = page.meta('description')
        assert len(description) == 1 and 40 <= len(description[0]) <= 200, f'{route}: invalid description'
        assert description[0] not in descriptions, f'{route}: duplicate description'
        descriptions.add(description[0])
        assert len(page.canonicals) == 1, f'{route}: missing/duplicate canonical'
        canonical = page.canonicals[0]
        target = '' if route == 'index.html' else route.removesuffix('/index.html').removesuffix('.html')
        expected = urljoin(root_url, target)
        assert canonical.rstrip('/') == expected.rstrip('/'), f'{route}: incorrect canonical {canonical}'
        canonical_urls.add(canonical.rstrip('/'))
        assert page.meta('og:title') == [page.title], f'{route}: inconsistent Open Graph title'
        assert page.meta('og:description') == description, f'{route}: inconsistent Open Graph description'
        assert page.meta('og:site_name') == ['Thunder-G'], f'{route}: incorrect site name'
        assert page.meta('og:url') == page.canonicals, f'{route}: inconsistent Open Graph URL'
        assert page.meta('twitter:title') == [page.title], f'{route}: inconsistent social title'
        assert page.meta('twitter:description') == description, f'{route}: inconsistent social description'
        if route == 'index.html':
            assert page.title == 'Thunder-G', 'Homepage title must be exactly Thunder-G'
            assert page.meta('og:type') == ['website'], 'Homepage should describe a website'
        else:
            assert page.meta('og:type') == ['article'], f'{route}: expected article metadata'
        images = page.meta('og:image')
        assert len(images) == 1 and images[0].startswith(root_url), f'{route}: incorrect social image URL'
        image_path = urlparse(images[0]).path.removeprefix(urlparse(root_url).path)
        image_file = output / image_path
        assert image_file.is_file(), f'{route}: missing social image'
        assert page.meta('twitter:card') == ['summary_large_image'], f'{route}: expected a large social card'
        assert page.meta('twitter:image') == images, f'{route}: inconsistent social image'
        assert page.meta('og:image:alt') == page.meta('twitter:image:alt') and page.meta('og:image:alt'), f'{route}: missing/inconsistent image description'
        image_data = image_file.read_bytes()
        assert image_data[:8] == b'\x89PNG\r\n\x1a\n', f'{route}: invalid PNG social image'
        width, height = struct.unpack('>II', image_data[16:24])
        assert page.meta('og:image:width') == [str(width)] and page.meta('og:image:height') == [str(height)], f'{route}: incorrect social image dimensions'
        assert page.meta('og:image:type') == ['image/png'], f'{route}: incorrect social image type'
        if route == 'index.html':
            graph = [item for schema in page.schemas for item in schema.get('@graph', [])]
            assert {item.get('@type') for item in graph} >= {'WebSite', 'SoftwareApplication'}, 'Missing homepage schemas'
        else:
            articles = [schema for schema in page.schemas if schema.get('@type') == 'TechArticle']
            assert len(articles) == 1 and articles[0]['headline'], f'{route}: missing article schema'
            assert articles[0]['url'].rstrip('/') == canonical.rstrip('/'), f'{route}: mismatched schema URL'
            assert articles[0]['description'] == description[0], f'{route}: mismatched schema description'
    sitemap = output / 'sitemap.xml'
    if indexable:
        assert sitemap.is_file(), 'Missing production sitemap'
        locations = {node.text.rstrip('/') for node in ET.parse(sitemap).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
        assert locations == canonical_urls, f'Sitemap mismatch: {locations ^ canonical_urls}'
    else:
        assert not sitemap.exists(), 'Preview should not publish an indexable sitemap'
    print(f'SEO checks passed: {len(canonical_urls)} content pages; {"indexable production" if indexable else "noindex preview"}.')


if __name__ == '__main__':
    check(Path(sys.argv[1] if len(sys.argv) > 1 else 'build'),
          os.environ.get('SITE_URL', 'https://vschiavoni.github.io'),
          os.environ.get('BASE_URL', '/'),
          os.environ.get('DOCS_NOINDEX') != 'true')
