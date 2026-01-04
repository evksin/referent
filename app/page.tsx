"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ActionType = "summary" | "theses" | "telegram" | null;

export default function Home() {
  const [url, setUrl] = useState("");
  const [actionType, setActionType] = useState<ActionType>(null);
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>("");
  const [error, setError] = useState<{ message: string; type?: string } | null>(
    null
  );

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleAction = async (type: ActionType) => {
    if (!url.trim()) {
      alert("Пожалуйста, введите URL статьи");
      return;
    }

    if (!type) {
      return;
    }

    setActionType(type);
    setIsLoading(true);
    setResult("");
    setError(null);
    setProcessStatus("Загружаю статью...");

    try {
      const response = await fetch("/api/ai-process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          actionType: type,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; message?: string; type?: string } = {};
        try {
          errorData = await response.json();
        } catch {
          // Если не удалось распарсить JSON
        }

        // Определяем тип ошибки и сообщение
        const errorType = errorData.type || errorData.error || "UNKNOWN";
        let errorMessage = "Произошла ошибка при обработке статьи.";

        // Обработка ошибок загрузки статьи (404, 500, таймаут)
        if (
          errorType === "FETCH_ERROR" ||
          errorType === "NOT_FOUND" ||
          errorType === "SERVER_ERROR" ||
          errorType === "TIMEOUT" ||
          errorType === "NETWORK_ERROR" ||
          response.status === 404 ||
          response.status === 408 ||
          response.status === 502 ||
          response.status === 503
        ) {
          errorMessage = "Не удалось загрузить статью по этой ссылке.";
        } else if (response.status === 504) {
          errorMessage =
            "Превышено время ожидания. Статья может быть слишком длинной.";
        } else if (response.status === 429) {
          errorMessage = "Превышен лимит запросов. Попробуйте позже.";
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (response.status === 401) {
          errorMessage = "Неверный API ключ. Проверьте настройки.";
        } else if (response.status === 400) {
          errorMessage =
            errorData.message || "Неверный запрос. Проверьте URL статьи.";
        }

        setError({ message: errorMessage, type: errorType });
        setResult("");
        setProcessStatus("");
        return;
      }

      setProcessStatus("Обрабатываю с помощью AI...");

      const data = await response.json();

      if (!data.result || data.result.trim().length === 0) {
        setError({
          message:
            "Получен пустой результат от AI. Попробуйте еще раз или выберите другую статью.",
          type: "EMPTY_RESULT",
        });
        setResult("");
        setProcessStatus("");
        return;
      }

      setResult(data.result);
      setError(null);
      setProcessStatus("");
    } catch (error) {
      // Обработка сетевых ошибок
      if (error instanceof TypeError && error.message.includes("fetch")) {
        setError({
          message:
            "Не удалось подключиться к серверу. Проверьте подключение к интернету.",
          type: "NETWORK_ERROR",
        });
      } else {
        setError({
          message:
            error instanceof Error
              ? error.message
              : "Произошла неизвестная ошибка.",
          type: "UNKNOWN",
        });
      }
      setResult("");
      setProcessStatus("");
    } finally {
      setIsLoading(false);
    }
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
            placeholder="Введите URL статьи, например: https://example.com/article"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Укажите ссылку на англоязычную статью
          </p>
        </div>

        {/* Кнопки действий */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => handleAction("summary")}
            disabled={isLoading}
            title="Получить краткое описание статьи на русском языке"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            О чем статья?
          </button>
          <button
            onClick={() => handleAction("theses")}
            disabled={isLoading}
            title="Выделить основные тезисы статьи в виде маркированного списка"
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Тезисы
          </button>
          <button
            onClick={() => handleAction("telegram")}
            disabled={isLoading}
            title="Создать пост для Telegram канала с эмодзи и хештегами"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Пост для Telegram
          </button>
        </div>

        {/* Блок статуса процесса */}
        {processStatus && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {processStatus}
              </p>
            </div>
          </div>
        )}

        {/* Блок ошибок */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* Блок результата */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
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
            {result && !result.startsWith("Ошибка") && (
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center gap-2"
                title="Копировать результат"
              >
                {copied ? (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Скопировано!</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Копировать</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="min-h-[200px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-[200px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">
                  {actionType === "summary" && "Анализирую статью..."}
                  {actionType === "theses" && "Выделяю основные тезисы..."}
                  {actionType === "telegram" && "Создаю пост..."}
                  {!actionType && "Обработка..."}
                </p>
              </div>
            ) : result && !error ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 overflow-auto">
                {actionType === "theses" || actionType === "telegram" ? (
                  <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-sans text-base leading-relaxed">
                    {result}
                  </div>
                ) : result.includes('"title"') || result.includes('"date"') ? (
                  <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-sm leading-relaxed">
                    {result}
                  </pre>
                ) : (
                  <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-sans text-base leading-relaxed">
                    {result}
                  </div>
                )}
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
