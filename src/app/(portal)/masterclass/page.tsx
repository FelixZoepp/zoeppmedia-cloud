'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, Play, Check, ChevronRight, BookOpen, Clock
} from 'lucide-react';
import Link from 'next/link';

interface LessonTask {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_provider: string;
  duration_minutes: number | null;
  sort_order: number;
  lesson_tasks: LessonTask[];
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export default function MasterclassPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, boolean>>({});
  const [taskProgress, setTaskProgress] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    fetch('/api/masterclass')
      .then((r) => r.json())
      .then((data) => {
        setModules(data.modules);
        setLessons(data.lessons);
        setLessonProgress(data.lessonProgress);
        setTaskProgress(data.taskProgress);
        setLoading(false);
      });
  }, []);

  async function toggleLessonWatched(lessonId: string) {
    const current = lessonProgress[lessonId] || false;
    const newVal = !current;
    setLessonProgress((prev) => ({ ...prev, [lessonId]: newVal }));
    await fetch('/api/masterclass/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'lesson', id: lessonId, value: newVal }),
    });
  }

  async function toggleTaskCompleted(taskId: string) {
    const current = taskProgress[taskId] || false;
    const newVal = !current;
    setTaskProgress((prev) => ({ ...prev, [taskId]: newVal }));
    await fetch('/api/masterclass/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task', id: taskId, value: newVal }),
    });
  }

  function getVideoEmbed(lesson: Lesson) {
    if (!lesson.video_url) return null;
    let embedUrl = lesson.video_url;

    if (lesson.video_provider === 'youtube') {
      const match = lesson.video_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
      if (match) embedUrl = `https://www.youtube.com/embed/${match[1]}`;
    } else if (lesson.video_provider === 'vimeo') {
      const match = lesson.video_url.match(/vimeo\.com\/(\d+)/);
      if (match) embedUrl = `https://player.vimeo.com/video/${match[1]}`;
    }

    return (
      <div className="aspect-video bg-black rounded-xl overflow-hidden mb-6">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-[#E31B23] rounded-full animate-spin" />
      </div>
    );
  }

  // Calculate overall progress
  const totalLessons = lessons.length;
  const watchedLessons = Object.values(lessonProgress).filter(Boolean).length;
  const progressPercent = totalLessons > 0 ? Math.round((watchedLessons / totalLessons) * 100) : 0;

  return (
    <div className="flex gap-8">
      {/* Left sidebar: module list */}
      <div className="w-72 flex-shrink-0">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900">Masterclass</h1>
            <p className="text-[14px] text-gray-600">{progressPercent}% abgeschlossen</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-red-600 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="space-y-8">
          {modules.map((mod) => {
            const modLessons = lessons.filter((l) => l.module_id === mod.id);
            const modCompleted = modLessons.filter((l) => lessonProgress[l.id]).length;
            const allDone = modLessons.length > 0 && modCompleted === modLessons.length;

            return (
              <div key={mod.id}>
                <div className="flex items-center gap-3 mb-5 px-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                    allDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {allDone ? <Check className="w-3 h-3" /> : mod.sort_order}
                  </div>
                  <span className="text-[14px] font-semibold text-gray-900 uppercase tracking-wide">
                    {mod.title}
                  </span>
                  <span className="text-[11px] text-gray-400 ml-auto">
                    {modCompleted}/{modLessons.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {modLessons.map((lesson) => {
                    const isActive = activeLesson?.id === lesson.id;
                    const isWatched = lessonProgress[lesson.id];

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => setActiveLesson(lesson)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-left text-[14px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-red-50 border border-red-200 text-red-700 font-medium'
                            : 'text-gray-900 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        {isWatched ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Play className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{lesson.title}</span>
                        {lesson.duration_minutes && (
                          <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
                            {lesson.duration_minutes}m
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: lesson content */}
      <div className="flex-1 min-w-0">
        {activeLesson ? (
          <div>
            {getVideoEmbed(activeLesson)}

            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-[22px] font-bold text-gray-900">{activeLesson.title}</h2>
                {activeLesson.description && (
                  <p className="text-gray-600 mt-1">{activeLesson.description}</p>
                )}
              </div>
              <Button
                variant={lessonProgress[activeLesson.id] ? 'soft' : 'primary'}
                size="sm"
                onClick={() => toggleLessonWatched(activeLesson.id)}
              >
                <Check className="w-4 h-4" />
                {lessonProgress[activeLesson.id] ? 'Angesehen' : 'Als gesehen markieren'}
              </Button>
            </div>

            {/* Lesson tasks */}
            {activeLesson.lesson_tasks && activeLesson.lesson_tasks.length > 0 && (
              <Card padding="md" className="mt-8">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-5 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-red-600" />
                  Aufgaben
                </h3>
                <div className="space-y-5">
                  {activeLesson.lesson_tasks.map((task) => (
                    <label key={task.id} className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={taskProgress[task.id] || false}
                        onChange={() => toggleTaskCompleted(task.id)}
                        className="mt-0.5 w-5 h-5 rounded border-gray-200 text-red-600 accent-[#E31B23]"
                      />
                      <div>
                        <span className={`text-[15px] font-medium ${
                          taskProgress[task.id] ? 'text-gray-400 line-through' : 'text-gray-900'
                        }`}>
                          {task.title}
                        </span>
                        {task.description && (
                          <p className="text-[14px] text-gray-600 mt-0.5">{task.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card padding="lg" className="text-center">
            <GraduationCap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-[18px] font-bold text-gray-900 mb-2">Wähle eine Lektion</h2>
            <p className="text-gray-600">
              Klicke auf eine Lektion links, um mit der Masterclass zu beginnen.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
