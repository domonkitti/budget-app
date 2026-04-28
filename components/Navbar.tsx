"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const path = usePathname()

  const navLinks = [
    { href: "/", label: "Overall" },
    { href: "/category", label: "Category" },
  ]

  return (
    <nav className="bg-white border-b px-6 h-12 flex items-center gap-1 sticky top-0 z-30">
      <span className="font-bold text-gray-800 text-sm mr-4">Budget App</span>

      {navLinks.map(l => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            path === l.href
              ? "bg-blue-600 text-white"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
          }`}
        >
          {l.label}
        </Link>
      ))}

      <div className="flex-1" />

      <Link href="/categories" className={`text-xs px-2 py-1 rounded transition-colors ${
        path === "/categories" ? "text-blue-600 font-medium" : "text-gray-400 hover:text-gray-600"
      }`}>
        Category Settings
      </Link>
    </nav>
  )
}
