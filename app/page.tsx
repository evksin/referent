"use client";

import { useState } from "react";

type ActionType = "summary" | "theses" | "telegram" | null;

export default function Home() {
  const [url, setUrl] = useState("");
  const [actionType, setActionType] = useState<ActionType>(null);
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleParse = async () => {
    if (!url.trim()) {
      alert("Пожалуйста, введите URL статьи");
      return;
    }

    setIsLoading(true);
    setResult("");
    setActionType(null);

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при парсинге");
      }

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(
        `Ошибка: ${
          error instanceof Error ? error.message : "Неизвестная ошибка"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!url.trim()) {
      alert("Пожалуйста, введите URL статьи");
      return;
    }

    setIsLoading(true);
    setResult("");
    setActionType(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при переводе");
      }

      const data = await response.json();
      setResult(data.translation);
    } catch (error) {
      setResult(
        `Ошибка: ${
          error instanceof Error ? error.message : "Неизвестная ошибка"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (type: ActionType) => {
    if (!url.trim()) {
      alert("Пожалуйста, введите URL статьи");
      return;
    }

    setActionType(type);
    setIsLoading(true);
    setResult("");

    // Имитация загрузки (здесь будет реальная логика парсинга и AI)
    setTimeout(() => {
      const mockResults = {
        summary:
          "Это краткое описание статьи. Здесь будет результат анализа статьи с помощью AI.",
        theses:
          "• Тезис 1: Основная мысль статьи\n• Тезис 2: Важный момент\n• Тезис 3: Ключевой вывод",
        telegram:
          "📰 Заголовок статьи\n\nКраткое описание для Telegram канала...\n\n#новости #статья",
      };
      setResult(mockResults[type!]);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-900 dark:text-white">
          Referent
        </h1>
        <p className="text-center mb-8 text-gray-600 dark:text-gray-400">
          ИИ переводчик и обработчик страницы в Интернете
        </p>

        {/* Поле ввода URL */}
        <div className="mb-6">
          <label
            htmlFor="url"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            URL англоязычной статьи
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
          />
        </div>

        {/* Кнопки парсинга и перевода */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleParse}
            disabled={isLoading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Парсить статью
          </button>
          <button
            onClick={handleTranslate}
            disabled={isLoading}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Перевести статью
          </button>
        </div>

        {/* Кнопки действий */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => handleAction("summary")}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            О чем статья?
          </button>
          <button
            onClick={() => handleAction("theses")}
            disabled={isLoading}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Тезисы
          </button>
          <button
            onClick={() => handleAction("telegram")}
            disabled={isLoading}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Пост для Telegram
          </button>
        </div>

        {/* Блок результата */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 mt-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            {actionType === "summary" && "О чем статья?"}
            {actionType === "theses" && "Тезисы"}
            {actionType === "telegram" && "Пост для Telegram"}
            {!actionType &&
              (result
                ? result.startsWith("Ошибка")
                  ? "Ошибка"
                  : result.includes('"title"') || result.includes('"date"')
                  ? "Результат парсинга"
                  : "Перевод статьи"
                : "Результат")}
          </h2>
          <div className="min-h-[200px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-[200px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Обработка...</p>
              </div>
            ) : result ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 overflow-auto">
                <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-sm leading-relaxed">
                  {result}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-gray-500 dark:text-gray-400">
                <p>Нажмите на одну из кнопок выше, чтобы получить результат</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
