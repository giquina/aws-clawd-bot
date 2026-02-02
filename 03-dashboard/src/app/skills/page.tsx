'use client';

import { useEffect, useState } from 'react';
import { api, Skill } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Copy, ChevronDown, ChevronUp, Search } from 'lucide-react';

interface GroupedSkills {
  [category: string]: Skill[];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getSkills();
      setSkills(response.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  function categorizeSkills(skills: Skill[]): GroupedSkills {
    const categories: GroupedSkills = {
      'Core': [],
      'Claude Code Agent': [],
      'GitHub': [],
      'Accountancy': [],
      'Media': [],
      'Scheduling': [],
      'Research': [],
      'Config': [],
      'Other': [],
    };

    skills.forEach(skill => {
      const name = skill.name.toLowerCase();

      if (['help', 'memory', 'tasks', 'reminders'].includes(name)) {
        categories['Core'].push(skill);
      } else if (['project-context', 'remote-exec'].includes(name)) {
        categories['Claude Code Agent'].push(skill);
      } else if (['github', 'coder', 'review', 'stats', 'actions', 'multi-repo', 'project-creator'].includes(name)) {
        categories['GitHub'].push(skill);
      } else if (['deadlines', 'companies', 'governance', 'intercompany', 'receipts', 'moltbook'].includes(name)) {
        categories['Accountancy'].push(skill);
      } else if (['image-analysis', 'voice', 'video', 'files'].includes(name)) {
        categories['Media'].push(skill);
      } else if (['morning-brief', 'digest', 'overnight'].includes(name)) {
        categories['Scheduling'].push(skill);
      } else if (['research', 'vercel'].includes(name)) {
        categories['Research'].push(skill);
      } else if (['ai-settings', 'autonomous-config'].includes(name)) {
        categories['Config'].push(skill);
      } else {
        categories['Other'].push(skill);
      }
    });

    return Object.fromEntries(
      Object.entries(categories).filter(([_, skills]) => skills.length > 0)
    );
  }

  function filterSkills(skills: Skill[]): Skill[] {
    if (!searchQuery) return skills;

    const query = searchQuery.toLowerCase();
    return skills.filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.commands.some(cmd => cmd.toLowerCase().includes(query))
    );
  }

  function toggleExpanded(skillName: string) {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      if (next.has(skillName)) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }
      return next;
    });
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function getPriorityVariant(priority: number): 'default' | 'success' | 'warning' | 'error' {
    if (priority >= 80) return 'error';
    if (priority >= 50) return 'warning';
    if (priority >= 20) return 'success';
    return 'default';
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Skills</h1>
            <p className="text-gray-500">Loading available commands...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Skills</h1>
            <p className="text-gray-500">All available bot commands</p>
          </div>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Error Loading Skills</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadSkills} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredSkills = filterSkills(skills);
  const groupedSkills = categorizeSkills(filteredSkills);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-primary-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Skills</h1>
          <p className="text-gray-500">
            {skills.length} available commands across {Object.keys(groupedSkills).length} categories
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          type="text"
          placeholder="Search skills, commands, or descriptions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredSkills.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No skills found</CardTitle>
            <CardDescription>
              Try a different search term or clear your search.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSkills).map(([category, categorySkills]) => (
            <div key={category}>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                {category}
                <Badge variant="outline">{categorySkills.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categorySkills.map(skill => {
                  const isExpanded = expandedSkills.has(skill.name);
                  const displayedCommands = isExpanded ? skill.commands : skill.commands.slice(0, 3);
                  const hasMore = skill.commands.length > 3;

                  return (
                    <Card key={skill.name} className="flex flex-col">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{skill.name}</CardTitle>
                          <Badge variant={getPriorityVariant(skill.priority)}>
                            P{skill.priority}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {skill.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col">
                        <div className="space-y-2 flex-1">
                          {displayedCommands.map((command, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2"
                            >
                              <code className="text-xs text-gray-700 flex-1 font-mono">
                                {command}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyCommand(command)}
                                className="h-6 w-6 p-0"
                              >
                                <Copy
                                  className={`h-3 w-3 ${
                                    copiedCommand === command
                                      ? 'text-green-600'
                                      : 'text-gray-500'
                                  }`}
                                />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {hasMore && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(skill.name)}
                            className="mt-3 w-full justify-center gap-1 text-xs"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Show Less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                Show {skill.commands.length - 3} More
                              </>
                            )}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
