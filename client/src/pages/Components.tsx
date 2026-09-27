import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Component, Copy, Check, Sparkles, LayoutTemplate, CreditCard, Users } from 'lucide-react'

const componentCategories = [
  {
    id: 'hero',
    name: 'Hero Sections',
    icon: LayoutTemplate,
    items: [
      {
        title: 'Modern SaaS Hero with Glow',
        desc: 'Dark theme hero with subtle radial gradients, badges, and dual CTA buttons.',
        prompt: 'Create a modern dark SaaS hero section with radiant purple-indigo gradients, a floating badge "Announcing v2.0", bold heading, subtitle, dual action buttons (Get Started, Watch Demo), and a preview dashboard mockup.'
      },
      {
        title: 'Minimalist Startup Hero',
        desc: 'Clean typography-first hero with newsletter input and social proof logos.',
        prompt: 'Build a minimalist startup landing hero section with clean typography, email signup form with instant validation, and a monochrome customer logo strip.'
      }
    ]
  },
  {
    id: 'features',
    name: 'Feature Grids',
    icon: Component,
    items: [
      {
        title: 'Bento Grid Features',
        desc: 'Interactive bento grid layout with 4 distinct cards and micro-interactions.',
        prompt: 'Design an interactive modern bento grid feature section with 4 cards of varying sizes, subtle glassmorphism borders, glowing hover effects, and icons.'
      },
      {
        title: 'Three-Column Icon Cards',
        desc: 'High-contrast card grid showcasing security, speed, and AI capabilities.',
        prompt: 'Build a 3-column feature section highlighting AI Speed, Enterprise Security, and Real-time Collaboration with icon pills and learn more links.'
      }
    ]
  },
  {
    id: 'pricing',
    name: 'Pricing Tables',
    icon: CreditCard,
    items: [
      {
        title: 'Tiered Pricing (Free, Pro, Enterprise)',
        desc: 'Three-tier card system with highlighted popular tier and annual discount toggle.',
        prompt: 'Create a responsive 3-tier pricing table (Starter, Pro with popular badge, Enterprise) with monthly/yearly billing toggle, feature checklists, and CTA buttons.'
      }
    ]
  },
  {
    id: 'testimonials',
    name: 'Social Proof',
    icon: Users,
    items: [
      {
        title: 'Customer Review Carousel / Grid',
        desc: 'Grid of testimonial cards with star ratings, avatars, and verified badges.',
        prompt: 'Build a dark-themed customer testimonials grid with 5-star ratings, author avatars, role titles, and customer quotes.'
      }
    ]
  }
]

export default function Components() {
  const navigate = useNavigate()
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)

  const handleUsePrompt = (prompt: string) => {
    sessionStorage.setItem('prefill_prompt', prompt)
    navigate('/')
  }

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(key)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h1 className="text-xl font-bold text-text">Component Library</h1>
        </div>
        <p className="text-sm text-text2">
          Ready-to-generate component blueprints. Click "Use Prompt" to instantly craft them in the Dashboard.
        </p>
      </div>

      <div className="space-y-8">
        {componentCategories.map((category) => {
          const Icon = category.icon
          return (
            <div key={category.id} className="space-y-4">
              <div className="flex items-center gap-2.5 border-b border-border pb-2">
                <Icon className="w-4 h-4 text-[#f4976c]" />
                <h2 className="text-sm font-semibold text-text">{category.name}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.items.map((item, idx) => {
                  const key = `${category.id}-${idx}`
                  const isCopied = copiedIndex === key
                  return (
                    <div
                      key={key}
                      className="p-5 rounded-xl border border-border bg-surface hover:border-border2 transition-all flex flex-col justify-between gap-4 group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-text text-sm">{item.title}</h3>
                          <button
                            onClick={() => handleCopy(key, item.prompt)}
                            title="Copy prompt"
                            className="p-1.5 rounded-lg border border-border text-text3 hover:text-text hover:bg-surface2 transition-colors"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-xs text-text2 leading-relaxed">{item.desc}</p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                          onClick={() => handleUsePrompt(item.prompt)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4976c] hover:bg-[#f38b5d] text-zinc-950 text-xs font-semibold transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Use in Builder</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
