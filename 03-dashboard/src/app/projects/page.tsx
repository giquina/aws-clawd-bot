'use client';

import { useEffect, useState } from 'react';
import { api, type Project, type ProjectStatusResponse, type TodoTask } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FolderGit2,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  Circle,
  Clock,
  RefreshCw,
  Rocket,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectTasks, setProjectTasks] = useState<Record<string, TodoTask[]>>({});
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());
  const [deploying, setDeploying] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProjects();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  }

  async function fetchProjectTasks(repoName: string) {
    if (projectTasks[repoName]) return;

    setLoadingTasks(prev => new Set(prev).add(repoName));
    try {
      const data = await api.getProjectStatus(repoName);
      if (data.tasks) {
        setProjectTasks(prev => ({ ...prev, [repoName]: data.tasks! }));
      }
    } catch (err) {
      console.error(`Failed to fetch tasks for ${repoName}:`, err);
    } finally {
      setLoadingTasks(prev => {
        const next = new Set(prev);
        next.delete(repoName);
        return next;
      });
    }
  }

  function toggleExpanded(repoName: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
        fetchProjectTasks(repoName);
      }
      return next;
    });
  }

  async function handleDeploy(repoName: string) {
    if (!confirm(`Are you sure you want to deploy ${repoName}?`)) return;

    setDeploying(repoName);
    try {
      const result = await api.deployProject(repoName);
      alert(result.success ? `Deployed ${repoName} successfully!` : `Deploy failed: ${result.errors}`);
    } catch (err) {
      alert(`Deploy error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeploying(null);
    }
  }

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      TypeScript: 'bg-blue-100 text-blue-800',
      JavaScript: 'bg-yellow-100 text-yellow-800',
      Python: 'bg-green-100 text-green-800',
      HTML: 'bg-orange-100 text-orange-800',
      CSS: 'bg-purple-100 text-purple-800',
      Java: 'bg-red-100 text-red-800',
      Swift: 'bg-orange-100 text-orange-800',
    };
    return colors[language] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <CardTitle>Error Loading Projects</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchProjects} variant="primary">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FolderGit2 className="h-8 w-8 text-primary-600" />
            Projects
          </h1>
          <p className="text-gray-600 mt-1">
            {projects.length} GitHub repositories
          </p>
        </div>
        <Button onClick={fetchProjects} variant="outline" size="md">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects found</CardTitle>
            <CardDescription>
              {searchQuery ? 'Try a different search term.' : 'No projects available.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const isExpanded = expandedProjects.has(project.name);
            const tasks = projectTasks[project.name] || [];
            const isLoadingTasks = loadingTasks.has(project.name);
            const completedTasks = tasks.filter(t => t.completed).length;
            const totalTasks = tasks.length;

            return (
              <Card key={project.name} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base truncate">
                          {project.name}
                        </CardTitle>
                        {project.private && (
                          <Badge variant="outline" className="text-xs">
                            Private
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm mt-1 line-clamp-2">
                        {project.description || 'No description'}
                      </CardDescription>
                    </div>
                    <a
                      href={`https://github.com/${project.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {project.language && (
                      <Badge className={getLanguageColor(project.language)}>
                        {project.language}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {formatDate(project.updatedAt)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col justify-end">
                  {/* Tasks Section */}
                  {isExpanded && (
                    <div className="mb-4">
                      {isLoadingTasks ? (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading tasks...
                        </div>
                      ) : tasks.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              Tasks: {completedTasks}/{totalTasks}
                            </span>
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {tasks.slice(0, 10).map((task) => (
                              <div
                                key={task.id}
                                className="flex items-start gap-2 text-sm py-1"
                              >
                                {task.completed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                )}
                                <span className={task.completed ? 'text-gray-400 line-through' : 'text-gray-700'}>
                                  {task.title}
                                </span>
                              </div>
                            ))}
                            {tasks.length > 10 && (
                              <p className="text-xs text-gray-500 pt-1">
                                +{tasks.length - 10} more tasks
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No TODO.md found</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpanded(project.name)}
                      className="flex-1"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Hide Tasks
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          View Tasks
                        </>
                      )}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleDeploy(project.name)}
                      disabled={deploying === project.name}
                    >
                      {deploying === project.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Rocket className="h-4 w-4 mr-1" />
                          Deploy
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
