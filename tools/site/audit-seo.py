"""Audit every public article's actual built HTML, translation graph and local links.
Run after build; exits nonzero on errors. A pass is technical validation, not ranking.
"""
import json,re,sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[2]
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__();self.tags=[];self.h1=0;self.feed(text)
 def handle_starttag(self,t,attrs):
  a=dict(attrs);self.tags.append((t,a));self.h1+=t=='h1'
def audit(root=ROOT):
 feed=json.loads((root/'data/content.json').read_text());errors=[];titles={};count=0
 for e in feed['items']:
  if e['access']!='PUBLIC':continue
  count+=1;rel=('' if e['language']=='en' else e['language']+'/')+e['urlPath'];path=root/rel/'index.html';url='https://foxrex.co/'+rel
  def fail(s):errors.append(rel+': '+s)
  if not path.exists():fail('missing built page');continue
  text=path.read_text();p=Page(text)
  def attr(tag,k,v):return [a for t,a in p.tags if t==tag and a.get(k)==v]
  if p.h1!=1:fail('expected one H1')
  if not attr('html','lang',e['language']):fail('wrong language')
  if not any(a.get('href')==url for a in attr('link','rel','canonical')):fail('wrong canonical')
  if not attr('meta','name','description'):fail('missing description')
  if any('noindex' in a.get('content','') for a in attr('meta','name','robots')):fail('public article noindex')
  title=re.search(r'<title>(.*?)</title>',text,re.S).group(1);key=(e['language'],title)
  if key in titles:fail('duplicate title: '+titles[key])
  titles[key]=rel
  for lang in ('en','ar','tr'):
   sibling=next((x for x in feed['items'] if x['translationGroupId']==e['translationGroupId'] and x['language']==lang and x['access']=='PUBLIC'),None)
   if sibling and not any(a.get('href')=='https://foxrex.co/'+('' if lang=='en' else lang+'/')+sibling['urlPath'] for a in attr('link','hreflang',lang)):fail('incorrect alternate '+lang)
  structured=[json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>',text,re.S)]
  nodes=[n for obj in structured for n in obj.get('@graph',[obj])]
  article=next((n for n in nodes if n.get('@type') in ('Article','NewsArticle')),None)
  if e['type']!='SIGNAL_RESULT' and not article:fail('missing article structured data')
  if article and (article.get('datePublished')!=e['publishedAt'] or article.get('dateModified')!=e['updatedAt'] or article.get('inLanguage')!=e['language']):fail('structured article dates/language mismatch')
  if not any(n.get('@type')=='BreadcrumbList' for n in nodes):fail('missing breadcrumbs')
  for t,a in p.tags:
   v=a.get('href') if t=='a' else a.get('src') if t=='img' else None
   if not v or v.startswith(('#','mailto:','tel:','http:','https:','data:')):continue
   target=(path.parent/unquote(v.split('#')[0].split('?')[0])).resolve()
   if not target.exists():fail('broken local link '+v)
  if not any(t=='img' and a.get('alt') for t,a in p.tags):fail('missing descriptive image alt')
 return count,errors
if __name__=='__main__':
 count,errors=audit();print(json.dumps(dict(articles=count,errors=errors),ensure_ascii=False,indent=2));sys.exit(bool(errors))
