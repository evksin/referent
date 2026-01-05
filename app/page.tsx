"use client";

import { useState, useRef, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ActionType = "summary" | "theses" | "telegram" | "illustration" | null;

export default function Home() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [actionType, setActionType] = useState<ActionType>(null);
  const [result, setResult] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>("");
  const [error, setError] = useState<{ message: string; type?: string } | null>(
    null
  );

  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    setUrl("");
    setFile(null);
    setFileName("");
    setActionType(null);
    setResult("");
    setImageUrl(null);
    setError(null);
    setProcessStatus("");
    setCopied(false);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError(null);
      // Очищаем URL при выборе файла
      setUrl("");
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    // Очищаем файл при вводе URL
    if (file) {
      setFile(null);
      setFileName("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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
    // Проверка: должен быть либо URL, либо файл
    if (!url.trim() && !file) {
      setError({
        message: "Пожалуйста, либо загрузите файл, либо введите URL статьи.",
        type: "VALIDATION_ERROR",
      });
      return;
    }

    if (!type) {
      return;
    }

    setActionType(type);
    setIsLoading(true);
    setResult("");
    setError(null);
    setProcessStatus(file ? "Обрабатываю файл..." : "Загружаю статью...");

    let parsedData: { title: string; content: string; date: string };

    try {
      // Если загружен файл, обрабатываем его
      if (file) {
        setProcessStatus("Извлекаю текст из файла...");

        const formData = new FormData();
        formData.append("file", file);

        const fileResponse = await fetch("/api/process-file", {
          method: "POST",
          body: formData,
        });

        if (!fileResponse.ok) {
          const errorData = await fileResponse.json();
          throw new Error(errorData.message || "Ошибка при обработке файла");
        }

        parsedData = await fileResponse.json();
      } else {
        // Если указан URL, парсим статью
        setProcessStatus("Загружаю статью...");

        const parseResponse = await fetch("/api/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.message || "Ошибка при парсинге статьи");
        }

        parsedData = await parseResponse.json();
      }

      // Проверяем наличие контента
      if (
        !parsedData.content ||
        parsedData.content === "Не найдено" ||
        parsedData.content.trim().length === 0
      ) {
        throw new Error(
          "Не удалось извлечь контент. Файл может быть пустым или поврежденным."
        );
      }

      // Для иллюстрации используем специальный API
      if (type === "illustration") {
        setProcessStatus("Создаю промпт для изображения...");

        const response = await fetch("/api/generate-illustration", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parsedData: {
              title: parsedData.title,
              content: parsedData.content,
              date: parsedData.date,
            },
          }),
        });

        if (!response.ok) {
          let errorData: { error?: string; message?: string; type?: string } =
            {};
          try {
            errorData = await response.json();
          } catch {
            // Если не удалось распарсить JSON, читаем как текст
            try {
              const errorText = await response.text();
              errorData = { message: errorText || "Неизвестная ошибка" };
            } catch {
              errorData = {
                message: `Ошибка ${response.status}: ${response.statusText}`,
              };
            }
          }

          const errorType = errorData.type || errorData.error || "UNKNOWN";
          let errorMessage =
            errorData.message ||
            errorData.error ||
            "Произошла ошибка при генерации иллюстрации.";

          setError({ message: errorMessage, type: errorType });
          setResult("");
          setImageUrl(null);
          setProcessStatus("");
          return;
        }

        const data = await response.json();

        if (data.imageUrl) {
          setImageUrl(data.imageUrl);
          setResult(data.prompt || "");
          setError(null);
          setProcessStatus("");
        } else {
          setError({
            message: "Не удалось получить изображение. Попробуйте еще раз.",
            type: "IMAGE_GENERATION_ERROR",
          });
          setResult("");
          setImageUrl(null);
          setProcessStatus("");
        }
        return;
      }

      // Отправляем на обработку AI для других типов действий
      setProcessStatus("Обрабатываю с помощью AI...");

      const response = await fetch("/api/ai-process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parsedData: {
            title: parsedData.title,
            content: parsedData.content,
            date: parsedData.date,
          },
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
      // Обработка ошибок
      if (error instanceof TypeError && error.message.includes("fetch")) {
        setError({
          message:
            "Не удалось подключиться к серверу. Проверьте подключение к интернету.",
          type: "NETWORK_ERROR",
        });
      } else {
        // Обработка ошибок файлов и других ошибок
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Произошла неизвестная ошибка.";

        // Определяем тип ошибки на основе сообщения
        let errorType = "UNKNOWN";
        if (
          errorMessage.includes("Неподдерживаемый формат") ||
          errorMessage.includes("UNSUPPORTED_FORMAT")
        ) {
          errorType = "UNSUPPORTED_FORMAT";
        } else if (
          errorMessage.includes("Размер файла") ||
          errorMessage.includes("FILE_TOO_LARGE")
        ) {
          errorType = "FILE_TOO_LARGE";
        } else if (
          errorMessage.includes("не удалось извлечь") ||
          errorMessage.includes("EMPTY_CONTENT")
        ) {
          errorType = "EMPTY_CONTENT";
        } else if (
          errorMessage.includes("не удалось обработать") ||
          errorMessage.includes("PARSE_ERROR")
        ) {
          errorType = "PARSE_ERROR";
        }

        setError({
          message: errorMessage,
          type: errorType,
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

        {/* Поле загрузки файла */}
        <div className="mb-4 md:mb-6">
          <label
            htmlFor="file"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Загрузить файл с ПК
          </label>
          <input
            id="file"
            ref={fileInputRef}
            type="file"
            accept=".doc,.docx,.pdf,.txt,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-600 dark:file:text-gray-200"
          />
          {fileName && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400 px-1">
              Выбран файл: {fileName}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 px-1">
            Поддерживаемые форматы: .doc, .docx, .pdf, .txt, .xls, .xlsx, .jpg,
            .jpeg, .png
          </p>
        </div>

        {/* Разделитель */}
        <div className="mb-4 md:mb-6 flex items-center gap-4">
          <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
          <span className="text-xs text-gray-500 dark:text-gray-400">или</span>
          <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
        </div>

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
            onChange={handleUrlChange}
            placeholder="Введите URL статьи, например: https://example.com/article"
            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 break-all"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 px-1">
            Укажите ссылку на англоязычную статью
          </p>
        </div>

        {/* Кнопки действий */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 md:mb-8">
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
          <button
            onClick={() => handleAction("illustration")}
            disabled={isLoading}
            title="Создать иллюстрацию на основе статьи"
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            Иллюстрация
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
        {(url || file || result || error || actionType) && (
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
              {actionType === "illustration" && "Иллюстрация"}
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
                  {actionType === "illustration" && "Генерирую иллюстрацию..."}
                  {!actionType && "Обработка..."}
                </p>
              </div>
            ) : (result || imageUrl) && !error ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700 overflow-auto">
                {actionType === "illustration" && imageUrl ? (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <img
                        src={imageUrl}
                        alt="Сгенерированная иллюстрация"
                        className="max-w-full h-auto rounded-lg shadow-md"
                      />
                    </div>
                    {result && (
                      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Промпт для генерации:
                        </p>
                        <p className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200 font-sans text-sm leading-relaxed">
                          {result}
                        </p>
                      </div>
                    )}
                  </div>
                ) : actionType === "theses" || actionType === "telegram" ? (
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
