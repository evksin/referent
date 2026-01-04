"use client";

import { useState, useRef, useEffect } from "react";
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

  const resultRef = useRef<HTMLDivElement>(null);

  const handleClear = () => {
    setUrl("");
    setActionType(null);
    setResult("");
    setError(null);
    setProcessStatus("");
    setCopied(false);
    setIsLoading(false);
  };

  // Автоматическая прокрутка к результатам после успешной генерации
  useEffect(() => {
    if (result && !error && !isLoading && resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [result, error, isLoading]);

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
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4 py-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-2 text-gray-900 dark:text-white px-2">
          Referent
        </h1>
        <p className="text-center mb-6 md:mb-8 text-sm sm:text-base text-gray-600 dark:text-gray-400 px-2">
          ИИ переводчик и обработчик страницы в Интернете
        </p>

        {/* Поле ввода URL */}
        <div className="mb-4 md:mb-6">
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
            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 break-all"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 px-1">
            Укажите ссылку на англоязычную статью
          </p>
        </div>

        {/* Кнопки действий */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6 md:mb-8">
          <button
            onClick={() => handleAction("summary")}
            disabled={isLoading}
            title="Получить краткое описание статьи на русском языке"
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            О чем статья?
          </button>
          <button
            onClick={() => handleAction("theses")}
            disabled={isLoading}
            title="Выделить основные тезисы статьи в виде маркированного списка"
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Тезисы
          </button>
          <button
            onClick={() => handleAction("telegram")}
            disabled={isLoading}
            title="Создать пост для Telegram канала с эмодзи и хештегами"
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Пост для Telegram
          </button>
        </div>

        {/* Блок статуса процесса */}
        {processStatus && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600 dark:border-blue-400 flex-shrink-0"></div>
              <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 font-medium break-words">
                {processStatus}
              </p>
            </div>
          </div>
        )}

        {/* Блок ошибок */}
        {error && (
          <Alert variant="destructive" className="mb-4 p-3 sm:p-4">
            <AlertTitle className="text-sm sm:text-base">Ошибка</AlertTitle>
            <AlertDescription className="text-xs sm:text-sm break-words">
              {error.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Кнопка очистки */}
        {(url || result || error || actionType) && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2"
              title="Очистить все поля и результаты"
            >
              <svg
                className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span>Очистить</span>
            </button>
          </div>
        )}

        {/* Блок результата */}
        <div
          ref={resultRef}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 mt-6 sm:mt-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white break-words">
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
                className="px-3 py-1.5 text-xs sm:text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 sm:gap-2 self-start sm:self-auto"
                title="Копировать результат"
              >
                {copied ? (
                  <>
                    <svg
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
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
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
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
          <div className="min-h-[150px] sm:min-h-[200px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-[150px] sm:h-[200px] px-2">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600 mb-3 sm:mb-4"></div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center">
                  {actionType === "summary" && "Анализирую статью..."}
                  {actionType === "theses" && "Выделяю основные тезисы..."}
                  {actionType === "telegram" && "Создаю пост..."}
                  {!actionType && "Обработка..."}
                </p>
              </div>
            ) : result && !error ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700 overflow-auto">
                {actionType === "theses" || actionType === "telegram" ? (
                  <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200 font-sans text-sm sm:text-base leading-relaxed">
                    {result}
                  </div>
                ) : result.includes('"title"') || result.includes('"date"') ? (
                  <pre className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
                    {result}
                  </pre>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200 font-sans text-sm sm:text-base leading-relaxed">
                    {result}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[150px] sm:h-[200px] px-4 text-gray-500 dark:text-gray-400">
                <p className="text-xs sm:text-sm text-center">
                  Нажмите на одну из кнопок выше, чтобы получить результат
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
