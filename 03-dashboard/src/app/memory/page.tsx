'use client';

import { useEffect, useState } from 'react';
import { api, type Message, type Fact } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MessageSquare, Brain, User, Bot, Calendar, Search, Loader2, AlertCircle } from 'lucide-react';

export default function MemoryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchMemory();
  }, []);

  async function fetchMemory() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getMemory(100);
      setMessages(data.messages || []);
      setFacts(data.facts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memory');
    } finally {
      setLoading(false);
    }
  }

  const toggleExpand = (id: number) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredMessages = messages.filter(msg =>
    msg.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFacts = facts.filter(fact =>
    fact.fact.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fact.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const factsByCategory = filteredFacts.reduce((acc, fact) => {
    if (!acc[fact.category]) {
      acc[fact.category] = [];
    }
    acc[fact.category].push(fact);
    return acc;
  }, {} as Record<string, Fact[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading memory...</p>
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
              <CardTitle>Error</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Memory</h1>
          <p className="text-gray-600 mt-1">
            {messages.length} messages • {facts.length} facts stored
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search messages and facts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Conversation History */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <CardTitle>Conversation History</CardTitle>
            </div>
            <CardDescription>
              Recent message exchanges ({filteredMessages.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">
                  {searchQuery ? 'No messages found' : 'No messages yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {filteredMessages.map((msg) => {
                  const isExpanded = expandedMessages.has(msg.id);
                  const shouldTruncate = msg.content.length > 200;
                  const displayContent = isExpanded || !shouldTruncate
                    ? msg.content
                    : msg.content.slice(0, 200) + '...';

                  return (
                    <div
                      key={msg.id}
                      className="p-4 rounded-lg border bg-white hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {msg.role === 'user' ? (
                            <User className="h-4 w-4 text-blue-600" />
                          ) : msg.role === 'assistant' ? (
                            <Bot className="h-4 w-4 text-green-600" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant="default"
                              className={
                                msg.role === 'user'
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }
                            >
                              {msg.role}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="h-3 w-3" />
                              {formatDate(msg.created_at)}
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {displayContent}
                          </p>
                          {shouldTruncate && (
                            <button
                              onClick={() => toggleExpand(msg.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 mt-2 font-medium"
                            >
                              {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stored Facts */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <CardTitle>Stored Facts</CardTitle>
            </div>
            <CardDescription>
              Knowledge base ({filteredFacts.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredFacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Brain className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">
                  {searchQuery ? 'No facts found' : 'No facts stored yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                {Object.entries(factsByCategory).map(([category, categoryFacts]) => (
                  <div key={category}>
                    <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {category}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        ({categoryFacts.length})
                      </span>
                    </h3>
                    <div className="space-y-2">
                      {categoryFacts.map((fact) => (
                        <div
                          key={fact.id}
                          className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow"
                        >
                          <p className="text-sm text-gray-700 mb-2">
                            {fact.fact}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="h-3 w-3" />
                            {formatDate(fact.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
