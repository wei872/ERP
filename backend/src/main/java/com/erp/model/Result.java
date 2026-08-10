package com.erp.model;

public class Result {
    private boolean success;
    private String message;
    private Object data;
    public static Result ok(Object d) { Result r = new Result(); r.success=true; r.data=d; return r; }
    public static Result error(String m) { Result r = new Result(); r.success=false; r.message=m; return r; }
    public boolean isSuccess() { return success; } public void setSuccess(boolean s) { success=s; }
    public String getMessage() { return message; } public void setMessage(String m) { message=m; }
    public Object getData() { return data; } public void setData(Object d) { data=d; }
}
