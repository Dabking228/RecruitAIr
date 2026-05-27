import { AgentDrawer } from '@/components/agent/AgentDrawer'

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <AgentDrawer role="candidate" />
    </>
  )
}