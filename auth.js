/* FOXREX admin gate. Client-side only: GitHub Pages is static, so this keeps casual
   visitors out of the Studio but is not server-side security. Put Cloudflare Access
   in front of /foxrex-studio.html for real protection. */
(function(){
  var KEY="foxrex-admin-session", HASH="c3e8184e6ed7345b7a0a9b5fa2b9daab587b8263bfe63601e7afaa414d055efb", TTL=12*3600*1000;
  function read(){ try{ var s=JSON.parse(localStorage.getItem(KEY)||"null"); return s&&s.h===HASH&&s.exp>Date.now()?s:null; }catch(e){ return null; } }
  async function sha(t){ var b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0");}).join(""); }
  window.FoxAuth={
    valid:function(){ return !!read(); },
    login:async function(user,pass,remember){
      if(await sha(String(user).trim().toLowerCase()+":"+pass)!==HASH) return false;
      try{ localStorage.setItem(KEY,JSON.stringify({h:HASH,exp:Date.now()+(remember?30*24*3600*1000:TTL)})); }catch(e){ return false; }
      return true;
    },
    logout:function(){ try{ localStorage.removeItem(KEY); }catch(e){} location.replace("login.html"); }
  };
  if(document.documentElement.hasAttribute("data-protected") && !read()){
    location.replace("login.html?next="+encodeURIComponent(location.pathname.split("/").pop()||"foxrex-studio.html"));
  }
})();
