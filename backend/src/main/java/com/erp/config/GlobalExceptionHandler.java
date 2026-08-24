package com.erp.config;

import com.erp.model.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;

/**
 * 全局异常兜底：统一错误响应格式，避免把堆栈/SQL 细节泄露给前端。
 * 业务代码里已 catch 的异常不受影响，这里只兜未捕获的部分。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result badRequest(IllegalArgumentException e) {
        return Result.error(e.getMessage() == null ? "请求参数无效" : e.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result malformed(Exception e) {
        return Result.error("请求体格式错误，请检查提交内容");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public Result tooLarge(MaxUploadSizeExceededException e) {
        return Result.error("上传文件超过大小限制（单文件 5MB）");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Result notFound(NoHandlerFoundException e) {
        return Result.error("接口不存在: " + e.getRequestURL());
    }

    @ExceptionHandler(DataAccessException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result dbError(DataAccessException e) {
        log.error("数据库访问异常", e);
        return Result.error("数据库操作失败，请联系管理员");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result other(Exception e) {
        log.error("未捕获异常", e);
        return Result.error("服务器内部错误，请稍后重试");
    }
}
