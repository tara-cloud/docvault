"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const navLinks = [
    { href: "/",           icon: "bi-grid-1x2-fill",        label: "Documents" },
    { href: "/upload",     icon: "bi-cloud-arrow-up-fill",  label: "Upload" },
    { href: "/categories", icon: "bi-tag-fill",             label: "Categories" },
    { href: "/settings",   icon: "bi-gear-fill",            label: "Settings" },
  ];

  return (
    <>
      {/* Desktop / tablet top navbar */}
      <nav className="dv-navbar">
        <div className="dv-navbar-inner">
          <Link href="/" className="dv-brand">
            <span className="dv-brand-icon"><i className="bi bi-safe2-fill" /></span>
            <span>DocVault</span>
          </Link>
          <div className="dv-nav-links">
            {navLinks.map(({ href, icon, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`dv-nav-link${active ? " active" : ""}`}>
                  <i className={`bi ${icon}`} />
                  <span>{label}</span>
                  {active && <span className="nav-dot" />}
                </Link>
              );
            })}
          </div>
          <button type="button" className="dv-signout" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right" />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="dv-bottom-nav" aria-label="Main navigation">
        {navLinks.map(({ href, icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`dv-bottom-nav-item${active ? " active" : ""}`}>
              <i className={`bi ${icon}`} />
              <span>{label}</span>
            </Link>
          );
        })}
        <button type="button" className="dv-bottom-nav-item" onClick={handleLogout}>
          <i className="bi bi-box-arrow-right" />
          <span>Sign Out</span>
        </button>
      </nav>
    </>
  );
}
